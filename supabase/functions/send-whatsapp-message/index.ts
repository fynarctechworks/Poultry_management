// supabase/functions/send-whatsapp-message/index.ts
// Called by:
//   1. send-daily-digest Edge Function (daily_digest template)
//   2. send-heat-stress-alert Edge Function (heat_stress_alert template)
//   3. send-vaccination-reminders Edge Function (vaccination_reminder template)
//   4. send-payment-reminders Edge Function (payment_reminder template)
//   5. send-low-stock-alerts Edge Function (low_stock_alert template)
//   6. DB trigger check_mortality_spike (mortality_alert template)
//
// Auth: service-role Bearer token only (no user JWT accepted).
//
// Logic:
//   1. Validate request body with Zod.
//   2. Reject template IDs not in the 6 Meta-approved list.
//   3. Enforce freemium: free-tier farms capped at 5 WhatsApp sends/month.
//   4. POST to AiSensy campaign/template API.
//   5. Insert a row into whatsapp_messages_log (success AND failure — always).
//   6. Return { sent, log_id } or { sent: false, reason }.
//
// NEVER throw on AiSensy failure — inserting the failure row IS the success path.
// NEVER expose the service role key in responses or logs.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// Approved WhatsApp template IDs (Meta-approved via AiSensy — never change)
// Matches exactly the 6 IDs in CLAUDE.md "WhatsApp Templates" section.
// ---------------------------------------------------------------------------
const APPROVED_TEMPLATE_IDS = [
  "daily_digest",
  "mortality_alert",
  "vaccination_reminder",
  "heat_stress_alert",
  "payment_reminder",
  "low_stock_alert",
] as const;

type ApprovedTemplateId = (typeof APPROVED_TEMPLATE_IDS)[number];

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------
const PayloadSchema = z.object({
  farm_id: z.string().uuid(),
  recipient_phone: z
    .string()
    .regex(/^\+\d{10,15}$/, "recipient_phone must be E.164 (+digits, 10-15 digits total)"),
  // message_type carries semantic meaning for the audit log; wider than template IDs
  message_type: z.enum([
    "daily_digest",
    "mortality_alert",
    "vaccination_reminder",
    "heat_stress_alert",
    "payment_reminder",
    "low_stock_alert",
    "invoice",
    "traceability_cert",
    "report",
  ]),
  // template_id must be one of the 6 approved IDs
  template_id: z.string().min(1),
  // Ordered positional params matching {{1}}, {{2}}... placeholders in the template
  template_params: z.array(z.string()),
});

type Payload = z.infer<typeof PayloadSchema>;

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
  // 2. Parse + validate body
  // ---------------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = PayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }

  const payload: Payload = parsed.data;

  // ---------------------------------------------------------------------------
  // 3. Validate template_id is one of the 6 approved IDs
  // ---------------------------------------------------------------------------
  if (!(APPROVED_TEMPLATE_IDS as readonly string[]).includes(payload.template_id)) {
    return jsonResponse(
      {
        error: "Unapproved template_id",
        message: `template_id '${payload.template_id}' is not in the Meta-approved list. Approved: ${APPROVED_TEMPLATE_IDS.join(", ")}`,
      },
      400,
    );
  }

  const approvedTemplateId = payload.template_id as ApprovedTemplateId;

  // ---------------------------------------------------------------------------
  // 4. Service-role Supabase client
  // ---------------------------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ---------------------------------------------------------------------------
  // 5. Freemium enforcement
  //    - Look up the farm owner's subscription_status via farms → profiles
  //    - Free-tier farms: max 5 non-failed WhatsApp messages per calendar month
  //    - Paid farms: unlimited
  // ---------------------------------------------------------------------------
  const { data: farmRow, error: farmError } = await supabase
    .from("farms")
    .select("owner_id, farm_name, profiles!farms_owner_id_fkey(subscription_status, updated_at, whatsapp_opt_in, whatsapp_preferences)")
    .eq("id", payload.farm_id)
    .maybeSingle();

  if (farmError) {
    console.error("Failed to fetch farm:", farmError.message);
    return jsonResponse(
      { error: "Failed to fetch farm data", details: farmError.message },
      500,
    );
  }

  if (!farmRow) {
    return jsonResponse({ error: "Farm not found" }, 404);
  }

  // Supabase returns the joined profile as an array or object depending on
  // the relation cardinality; guard both shapes.
  type ProfileJoin =
    | {
        subscription_status: string;
        updated_at: string;
        whatsapp_opt_in?: boolean;
        whatsapp_preferences?: Record<string, boolean> | null;
      }
    | Array<{
        subscription_status: string;
        updated_at: string;
        whatsapp_opt_in?: boolean;
        whatsapp_preferences?: Record<string, boolean> | null;
      }>;
  const profileJoin = farmRow.profiles as ProfileJoin;
  const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;
  const subscriptionStatus: string = profile?.subscription_status ?? "free";
  const profileUpdatedAt: Date | null = profile?.updated_at
    ? new Date(profile.updated_at)
    : null;
  const whatsappOptIn: boolean = profile?.whatsapp_opt_in ?? true;
  const whatsappPreferences = (profile?.whatsapp_preferences ?? {}) as Record<
    string,
    boolean
  >;

  // Per-category opt-out: only the 6 approved template IDs have preference
  // keys; other message_type values (invoice, traceability_cert, report)
  // are user-initiated shares and always allowed.
  const categoryPref = whatsappPreferences[approvedTemplateId];
  const isApprovedTemplate = (APPROVED_TEMPLATE_IDS as readonly string[]).includes(
    payload.message_type,
  );

  if (!whatsappOptIn || (isApprovedTemplate && categoryPref === false)) {
    const { data: logRow } = await supabase
      .from("whatsapp_messages_log")
      .insert({
        farm_id: payload.farm_id,
        recipient_phone: payload.recipient_phone,
        message_type: payload.message_type,
        template_id: approvedTemplateId,
        payload_json: { template_params: payload.template_params, message_type: payload.message_type },
        aisensy_message_id: null,
        status: "failed",
        error_message: !whatsappOptIn
          ? "Recipient has opted out of all WhatsApp notifications"
          : `Recipient has opted out of '${payload.message_type}' notifications`,
      })
      .select("id")
      .maybeSingle();

    return jsonResponse({
      sent: false,
      reason: !whatsappOptIn ? "opted_out_global" : "opted_out_category",
      log_id: logRow?.id ?? null,
    });
  }

  const farmName: string = farmRow.farm_name ?? "Farm";

  // Mirror public.is_paid() semantics inline (avoids an extra RPC round-trip):
  //   - "active"   → always paid
  //   - "past_due" AND updated_at within the last 7 days → grace-period paid
  //   - everything else (free, cancelled, out-of-grace past_due) → free tier
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const inGrace =
    subscriptionStatus === "past_due" &&
    profileUpdatedAt !== null &&
    Date.now() - profileUpdatedAt.getTime() < SEVEN_DAYS_MS;

  const isPaid = subscriptionStatus === "active" || inGrace;

  if (!isPaid) {
    // Count this month's non-failed messages for this farm
    const now = new Date();
    const monthStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1).toISOString();

    const { count: monthCount, error: countError } = await supabase
      .from("whatsapp_messages_log")
      .select("id", { count: "exact", head: true })
      .eq("farm_id", payload.farm_id)
      .neq("status", "failed")
      .gte("created_at", monthStart);

    if (countError) {
      console.error("Failed to count monthly messages:", countError.message);
      // Non-fatal: allow send to avoid blocking legitimate messages on a DB hiccup
    } else if ((monthCount ?? 0) >= 5) {
      // Insert failure audit row and return without sending
      const { data: logRow } = await supabase
        .from("whatsapp_messages_log")
        .insert({
          farm_id: payload.farm_id,
          recipient_phone: payload.recipient_phone,
          message_type: payload.message_type,
          template_id: approvedTemplateId,
          payload_json: { template_params: payload.template_params, message_type: payload.message_type },
          aisensy_message_id: null,
          status: "failed",
          error_message: "Free plan WhatsApp limit (5/month) reached",
        })
        .select("id")
        .maybeSingle();

      return jsonResponse({
        sent: false,
        reason: "freemium_limit",
        log_id: logRow?.id ?? null,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Guard: check AISENSY_API_KEY is configured
  //    If missing, log a failure row and return gracefully — do NOT throw.
  //    This allows the function to be deployed before the AiSensy account is live.
  // ---------------------------------------------------------------------------
  const aisensyApiKey = Deno.env.get("AISENSY_API_KEY");
  if (!aisensyApiKey) {
    console.warn("AISENSY_API_KEY not configured — skipping send, logging failure");

    const { data: logRow } = await supabase
      .from("whatsapp_messages_log")
      .insert({
        farm_id: payload.farm_id,
        recipient_phone: payload.recipient_phone,
        message_type: payload.message_type,
        template_id: approvedTemplateId,
        payload_json: { template_params: payload.template_params, message_type: payload.message_type },
        aisensy_message_id: null,
        status: "failed",
        error_message: "AISENSY_API_KEY not configured",
      })
      .select("id")
      .maybeSingle();

    return jsonResponse({
      sent: false,
      reason: "not_configured",
      log_id: logRow?.id ?? null,
    });
  }

  // ---------------------------------------------------------------------------
  // 7. POST to AiSensy campaign/template API
  //    Endpoint: https://backend.aisensy.com/campaign/t1/api/v2
  //    Body shape: { apiKey, campaignName, destination, userName, templateParams }
  // ---------------------------------------------------------------------------
  let aisensyMessageId: string | null = null;
  let sendStatus: "sent" | "failed" = "failed";
  let errorMessage: string | null = null;

  try {
    const aisensyPayload = {
      apiKey: aisensyApiKey,
      campaignName: approvedTemplateId,
      destination: payload.recipient_phone,
      userName: farmName,
      templateParams: payload.template_params,
    };

    const aisensyRes = await fetch(
      "https://backend.aisensy.com/campaign/t1/api/v2",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aisensyPayload),
      },
    );

    if (aisensyRes.ok) {
      let responseJson: Record<string, unknown> = {};
      try {
        responseJson = await aisensyRes.json();
      } catch {
        // AiSensy returned non-JSON body on success — treat as ok
      }
      aisensyMessageId =
        (responseJson?.messageId as string) ??
        (responseJson?.message_id as string) ??
        null;
      sendStatus = "sent";
    } else {
      errorMessage = await aisensyRes.text().catch(() => `HTTP ${aisensyRes.status}`);
      console.warn(
        `AiSensy API error for farm ${payload.farm_id}: HTTP ${aisensyRes.status} — ${errorMessage}`,
      );
      sendStatus = "failed";
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`Network error calling AiSensy for farm ${payload.farm_id}:`, errorMessage);
    sendStatus = "failed";
  }

  // ---------------------------------------------------------------------------
  // 8. Audit log — always insert, both success and failure
  // ---------------------------------------------------------------------------
  const { data: logRow, error: logError } = await supabase
    .from("whatsapp_messages_log")
    .insert({
      farm_id: payload.farm_id,
      recipient_phone: payload.recipient_phone,
      message_type: payload.message_type,
      template_id: approvedTemplateId,
      payload_json: {
        template_params: payload.template_params,
        message_type: payload.message_type,
      },
      aisensy_message_id: aisensyMessageId,
      status: sendStatus,
      error_message: errorMessage,
    })
    .select("id")
    .maybeSingle();

  if (logError) {
    // Log error is non-fatal but should be visible in function logs
    console.error("Failed to insert whatsapp_messages_log row:", logError.message);
  }

  // ---------------------------------------------------------------------------
  // 9. Return result
  // ---------------------------------------------------------------------------
  if (sendStatus === "sent") {
    return jsonResponse({ sent: true, log_id: logRow?.id ?? null });
  }

  return jsonResponse(
    { sent: false, reason: "aisensy_error", log_id: logRow?.id ?? null },
  );
});
