// supabase/functions/send-push-notification/index.ts
// Called by:
//   1. check_mortality_spike DB trigger (via pg_net / tg_post_to_edge_function)
//      Payload: { event: "mortality_spike", farm_id, batch_id, batch_code,
//                 birds_dead, mortality_pct, log_date }
//   2. fetch-weather-data Edge Function (heat-stress alerts)
//      Payload: { farm_id, title, body, data?, badge?, sound?, priority? }
//   3. Any future caller using the direct payload shape above.
//
// Auth: service-role Bearer token only (no user JWT accepted).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// Direct-call shape (used by fetch-weather-data and future callers).
const DirectPayloadSchema = z.object({
  farm_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  data: z.record(z.unknown()).optional(),
  badge: z.number().int().nonnegative().optional(),
  sound: z.union([z.literal("default"), z.string()]).optional().default("default"),
  priority: z.enum(["default", "high"]).optional().default("high"),
});

// DB-trigger shape (from check_mortality_spike).
const TriggerPayloadSchema = z.object({
  event: z.enum(["mortality_spike"]),
  farm_id: z.string().uuid(),
  batch_id: z.string().uuid(),
  batch_code: z.string(),
  birds_dead: z.number(),
  mortality_pct: z.number(),
  log_date: z.string(),
});

// Union: try direct first, fall back to trigger shape.
const PayloadSchema = z.union([DirectPayloadSchema, TriggerPayloadSchema]);

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Expo push message type
// ---------------------------------------------------------------------------
interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: string;
  badge?: number;
  priority?: string;
  channelId?: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Auth — service role only
  // ---------------------------------------------------------------------------
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");

  const providedToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isAuthorized =
    (providedToken && providedToken === serviceRoleKey) ||
    (apikeyHeader && apikeyHeader === serviceRoleKey);

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Parse + validate body
  // ---------------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const parsed = PayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Validation failed", details: parsed.error.flatten() }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Normalise to a push message shape
  // ---------------------------------------------------------------------------
  let farm_id: string;
  let title: string;
  let body: string;
  let data: Record<string, unknown> | undefined;
  let sound: string;
  let badge: number | undefined;
  let priority: string;

  if ("event" in parsed.data) {
    // DB trigger shape — compose human-readable push text
    const d = parsed.data;
    farm_id = d.farm_id;
    title = "Mortality Alert";
    body = `${d.birds_dead} birds dead in batch ${d.batch_code} (${d.mortality_pct.toFixed(1)}% of flock)`;
    data = {
      type: "mortality_alert",
      batch_id: d.batch_id,
      batch_code: d.batch_code,
      birds_dead: d.birds_dead,
      mortality_pct: d.mortality_pct,
      log_date: d.log_date,
    };
    sound = "default";
    priority = "high";
  } else {
    // Direct shape
    const d = parsed.data;
    farm_id = d.farm_id;
    title = d.title;
    body = d.body;
    data = d.data as Record<string, unknown> | undefined;
    sound = d.sound ?? "default";
    badge = d.badge;
    priority = d.priority ?? "high";
  }

  // ---------------------------------------------------------------------------
  // 4. Look up expo_push_tokens for this farm
  // ---------------------------------------------------------------------------
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceRoleKey,
  );

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("expo_push_token")
    .eq("farm_id", farm_id)
    .not("expo_push_token", "is", null);

  if (profilesError) {
    console.error("Error fetching push tokens:", profilesError.message);
    return new Response(
      JSON.stringify({ error: "Failed to fetch push tokens", details: profilesError.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  const tokens: string[] = (profiles ?? [])
    .map((p: { expo_push_token: string | null }) => p.expo_push_token)
    .filter((t): t is string => Boolean(t) && t.startsWith("ExponentPushToken["));

  if (tokens.length === 0) {
    return new Response(
      JSON.stringify({ sent: 0, ticket_ids: [], message: "No registered push tokens for farm" }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Send to Expo Push API
  // ---------------------------------------------------------------------------
  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title,
    body,
    data,
    sound,
    ...(badge !== undefined && { badge }),
    priority,
    channelId: "default", // Android notification channel
  }));

  const expoHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "Accept-Encoding": "gzip, deflate",
  };

  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN");
  if (expoAccessToken) {
    expoHeaders["Authorization"] = `Bearer ${expoAccessToken}`;
  }

  let ticketIds: string[] = [];

  try {
    const expoRes = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: expoHeaders,
      body: JSON.stringify(messages),
    });

    if (!expoRes.ok) {
      const errText = await expoRes.text();
      console.error("Expo push API error:", expoRes.status, errText);
      return new Response(
        JSON.stringify({ error: "Expo push API error", status: expoRes.status, details: errText }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const expoJson = await expoRes.json();
    // Expo returns { data: [ { status, id?, message?, details? }, ... ] }
    const tickets: Array<{ status: string; id?: string; message?: string; details?: unknown }> =
      expoJson?.data ?? [];

    tickets.forEach((ticket, i) => {
      if (ticket.status === "error") {
        const reason = ticket.details && typeof ticket.details === "object"
          ? (ticket.details as { error?: string }).error
          : ticket.message;
        console.warn(`Push ticket[${i}] error for token ${tokens[i]}: ${reason}`);
        // DeviceNotRegistered → caller should clear this token; log but don't fail.
      } else if (ticket.id) {
        ticketIds.push(ticket.id);
      }
    });
  } catch (err) {
    console.error("Network error calling Expo push API:", err);
    return new Response(
      JSON.stringify({ error: "Network error contacting Expo push API" }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ sent: tokens.length, ticket_ids: ticketIds }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
  );
});
