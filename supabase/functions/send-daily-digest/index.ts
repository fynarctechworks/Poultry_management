// supabase/functions/send-daily-digest/index.ts
// Called by:
//   1. pg_cron daily at 14:30 UTC (20:00 IST) via net.http_post
//      Migration: 20260519000007_schedule_daily_digest.sql
//
// Auth: service-role Bearer token only (no user JWT accepted).
//
// Logic:
//   1. Fetch all farms whose owner profile has whatsapp_opt_in=true AND whatsapp_phone IS NOT NULL.
//   2. For each farm:
//      a. Sum today's birds_dead and feed_consumed_kg from daily_logs (log_date = today UTC).
//      b. Look up the latest broiler market price for the farm's state.
//      c. Call send-whatsapp-message with template_id='daily_digest' and the 4 positional params.
//   3. Continue on per-farm failure (warn, don't throw).
//   4. Return { farms_processed, digests_sent }.
//
// Template used:
//   daily_digest: "Hi {{1}}, today's farm report: {{2}} mortality, {{3}} kg feed used,
//                  market broiler {{4}}/kg."
//   Params: [owner_name, mortality_count_str, feed_kg_str, broiler_price_str]
//
// Performance note: processes farms sequentially to stay within Deno memory limits.
// For > 1,000 farms, consider batching with Promise.allSettled in chunks of 50.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// Zod schema for farm rows returned from the query
// ---------------------------------------------------------------------------
const FarmRowSchema = z.object({
  id: z.string().uuid(),
  farm_name: z.string(),
  state: z.string().nullable(),
  profiles: z.union([
    z.object({
      full_name: z.string().nullable(),
      whatsapp_phone: z.string().nullable(),
      whatsapp_opt_in: z.boolean(),
    }),
    z.array(
      z.object({
        full_name: z.string().nullable(),
        whatsapp_phone: z.string().nullable(),
        whatsapp_opt_in: z.boolean(),
      }),
    ),
  ]),
});

type FarmRow = z.infer<typeof FarmRowSchema>;

// ---------------------------------------------------------------------------
// CORS headers — mirror send-vaccination-reminders exactly
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Helper: JSON response with CORS
// ---------------------------------------------------------------------------
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Helper: extract profile from Supabase join result (array or object)
// ---------------------------------------------------------------------------
function extractProfile(profiles: FarmRow["profiles"]): {
  full_name: string | null;
  whatsapp_phone: string | null;
  whatsapp_opt_in: boolean;
} | null {
  if (Array.isArray(profiles)) {
    return profiles[0] ?? null;
  }
  return profiles ?? null;
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
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---------------------------------------------------------------------------
  // 1. Auth — service role only (mirrors send-vaccination-reminders verbatim)
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
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // ---------------------------------------------------------------------------
  // 2. Service-role Supabase client
  // ---------------------------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ---------------------------------------------------------------------------
  // 3. Fetch eligible farms: owner must have whatsapp_opt_in=true and
  //    a non-null whatsapp_phone. Join profiles via farms.owner_id FK.
  // ---------------------------------------------------------------------------
  const { data: farmRows, error: farmsError } = await supabase
    .from("farms")
    .select(
      "id, farm_name, state, profiles!farms_owner_id_fkey(full_name, whatsapp_phone, whatsapp_opt_in)",
    );

  if (farmsError) {
    console.error("Failed to fetch farms:", farmsError.message);
    return jsonResponse(
      { error: "Failed to fetch farms", details: farmsError.message },
      500,
    );
  }

  // Filter to farms with opt-in owners that have a WhatsApp phone
  const eligibleFarms = ((farmRows ?? []) as unknown as FarmRow[]).filter(
    (farm) => {
      const profile = extractProfile(farm.profiles);
      return (
        profile !== null &&
        profile.whatsapp_opt_in === true &&
        profile.whatsapp_phone !== null &&
        profile.whatsapp_phone.trim() !== ""
      );
    },
  );

  const farms_processed = eligibleFarms.length;

  if (farms_processed === 0) {
    return jsonResponse({ farms_processed: 0, digests_sent: 0 });
  }

  // ---------------------------------------------------------------------------
  // 4. Determine today's date (UTC — cron fires at 14:30 UTC which is 20:00 IST
  //    same calendar day in India, so today UTC = today IST for this digest)
  // ---------------------------------------------------------------------------
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // ---------------------------------------------------------------------------
  // 5. Process each farm: aggregate today's logs, fetch market price, send digest
  // ---------------------------------------------------------------------------
  const whatsappUrl = `${supabaseUrl}/functions/v1/send-whatsapp-message`;
  let digests_sent = 0;

  for (const farm of eligibleFarms) {
    const profile = extractProfile(farm.profiles)!;

    try {
      // -- 5a. Aggregate today's daily_logs for this farm --
      const { data: logAgg, error: logError } = await supabase
        .from("daily_logs")
        .select("birds_dead, feed_consumed_kg")
        .eq("farm_id", farm.id)
        .eq("log_date", todayStr);

      if (logError) {
        console.warn(
          `Failed to fetch daily logs for farm ${farm.id}: ${logError.message}`,
        );
        // Continue — send digest with zero values rather than skip entirely
      }

      const logs = logAgg ?? [];
      const totalBirdsDead = logs.reduce(
        (sum, r) => sum + (Number(r.birds_dead) || 0),
        0,
      );
      const totalFeedKg = logs.reduce(
        (sum, r) => sum + (Number(r.feed_consumed_kg) || 0),
        0,
      );

      // -- 5b. Fetch latest broiler market price for this farm's state --
      let broilerPrice = "N/A";
      if (farm.state) {
        const { data: priceRow, error: priceError } = await supabase
          .from("market_prices")
          .select("broiler_price_per_kg")
          .eq("state", farm.state)
          .order("price_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (priceError) {
          console.warn(
            `Failed to fetch market price for state ${farm.state}: ${priceError.message}`,
          );
        } else if (priceRow?.broiler_price_per_kg != null) {
          broilerPrice = String(priceRow.broiler_price_per_kg);
        }
      }

      // -- 5c. Build template params matching daily_digest template:
      //    "Hi {{1}}, today's farm report: {{2}} mortality, {{3}} kg feed used,
      //     market broiler {{4}}/kg."
      //    [owner_name, mortality_count_str, feed_kg_str, broiler_price_str]
      const ownerName = profile.full_name ?? farm.farm_name ?? "Farmer";
      const templateParams = [
        ownerName,
        String(totalBirdsDead),
        totalFeedKg.toFixed(1),
        broilerPrice,
      ];

      // -- 5d. Call send-whatsapp-message --
      const waRes = await fetch(whatsappUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          farm_id: farm.id,
          recipient_phone: profile.whatsapp_phone,
          message_type: "daily_digest",
          template_id: "daily_digest",
          template_params: templateParams,
        }),
      });

      if (!waRes.ok) {
        const errText = await waRes.text();
        console.warn(
          `send-whatsapp-message HTTP error for farm ${farm.id}: ${waRes.status} — ${errText}`,
        );
        // Continue to next farm — per spec
        continue;
      }

      const waJson: { sent?: boolean } = await waRes.json().catch(() => ({}));
      if (waJson.sent === true) {
        digests_sent++;
      } else {
        console.warn(`Digest not sent for farm ${farm.id}:`, waJson);
      }
    } catch (err) {
      console.warn(`Unexpected error processing farm ${farm.id}:`, err);
      // Continue to next farm — per spec
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Return summary
  // ---------------------------------------------------------------------------
  return jsonResponse({ farms_processed, digests_sent });
});
