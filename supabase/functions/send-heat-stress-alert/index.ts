// supabase/functions/send-heat-stress-alert/index.ts
// Called by:
//   1. fetch-weather-data Edge Function (when forecast max temp exceeds the
//      farm's heat_stress_threshold_celsius in the next 24h)
//
// Auth: service-role Bearer token only (no user JWT accepted).
//
// Logic:
//   1. Idempotency: if a weather_alerts row already exists for
//      (farm_id, alert_type='heat_stress', alert_date), return without action.
//   2. Insert a weather_alerts row.
//   3. Flag weather_data.heat_stress_alert_triggered = true.
//   4. Send push via send-push-notification; on OK, flip sent_via_push.
//   5. If the farm owner has whatsapp_opt_in and a phone, send via
//      send-whatsapp-message (template 'heat_stress_alert'); on sent:true,
//      flip sent_via_whatsapp.
//   6. Per-channel failures are warn-and-continue — never throw.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------
const PayloadSchema = z.object({
  farm_id: z.string().uuid(),
  farm_name: z.string(),
  severity: z.enum(["warning", "critical"]),
  max_temp_forecast: z.number(),
  humidity_forecast: z.number(),
  mitigation_actions: z.array(z.string()),
  alert_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
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
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // -------------------------------------------------------------------------
  // Auth — service role only
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Parse + validate body
  // -------------------------------------------------------------------------
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

  // -------------------------------------------------------------------------
  // Service-role Supabase client
  // -------------------------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // -------------------------------------------------------------------------
  // 1. Idempotency — duplicate alert for the same farm + date
  // -------------------------------------------------------------------------
  const { data: existingAlert } = await supabase
    .from("weather_alerts")
    .select("id")
    .eq("farm_id", payload.farm_id)
    .eq("alert_type", "heat_stress")
    .eq("alert_date", payload.alert_date)
    .maybeSingle();

  if (existingAlert) {
    return jsonResponse({ alerted: false, reason: "duplicate" });
  }

  // -------------------------------------------------------------------------
  // 2. Insert weather_alerts row
  // -------------------------------------------------------------------------
  const { data: insertedAlert, error: insertError } = await supabase
    .from("weather_alerts")
    .insert({
      farm_id: payload.farm_id,
      alert_type: "heat_stress",
      alert_date: payload.alert_date,
      severity: payload.severity,
      max_temp_forecast: payload.max_temp_forecast,
      humidity_forecast: Math.round(payload.humidity_forecast),
      mitigation_actions_json: payload.mitigation_actions,
      sent_via_push: false,
      sent_via_whatsapp: false,
    })
    .select("id")
    .maybeSingle();

  if (insertError) {
    console.warn(
      `weather_alerts insert failed for farm ${payload.farm_id}:`,
      insertError.message,
    );
  }

  const alertId = insertedAlert?.id ?? null;

  // -------------------------------------------------------------------------
  // 3. Flag weather_data row
  // -------------------------------------------------------------------------
  await supabase
    .from("weather_data")
    .update({ heat_stress_alert_triggered: true })
    .eq("farm_id", payload.farm_id);

  // -------------------------------------------------------------------------
  // 4. Send push notification
  // -------------------------------------------------------------------------
  let sentViaPush = false;
  try {
    const pushRes = await fetch(
      `${supabaseUrl}/functions/v1/send-push-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          farm_id: payload.farm_id,
          title:
            payload.severity === "critical"
              ? `CRITICAL Heat Alert — ${payload.farm_name}`
              : `Heat Alert — ${payload.farm_name}`,
          body: `Forecast: ${payload.max_temp_forecast.toFixed(1)}°C tomorrow. ${payload.mitigation_actions[0] ?? ""}`,
          data: {
            type: "heat_stress_alert",
            farm_id: payload.farm_id,
            severity: payload.severity,
            max_temp_forecast: payload.max_temp_forecast,
            alert_date: payload.alert_date,
          },
          priority: "high",
        }),
      },
    );
    if (pushRes.ok) {
      sentViaPush = true;
      if (alertId) {
        await supabase
          .from("weather_alerts")
          .update({ sent_via_push: true })
          .eq("id", alertId);
      }
    } else {
      const errText = await pushRes.text().catch(() => `HTTP ${pushRes.status}`);
      console.warn(
        `Push failed for farm ${payload.farm_id}: ${pushRes.status} — ${errText}`,
      );
    }
  } catch (err) {
    console.warn(
      `Error calling send-push-notification for farm ${payload.farm_id}:`,
      err,
    );
  }

  // -------------------------------------------------------------------------
  // 5. Send WhatsApp (only if owner opted in and has a phone)
  // -------------------------------------------------------------------------
  let sentViaWhatsapp = false;
  try {
    const { data: farmRow } = await supabase
      .from("farms")
      .select(
        "owner_id, profiles!farms_owner_id_fkey(whatsapp_phone, whatsapp_opt_in)",
      )
      .eq("id", payload.farm_id)
      .maybeSingle();

    type ProfileShape = {
      whatsapp_phone: string | null;
      whatsapp_opt_in: boolean;
    };
    const profilesJoin = (farmRow?.profiles ?? null) as
      | ProfileShape
      | ProfileShape[]
      | null;
    const profile: ProfileShape | null = Array.isArray(profilesJoin)
      ? profilesJoin[0] ?? null
      : profilesJoin;

    const phone = profile?.whatsapp_phone?.trim() ?? "";
    const optedIn = profile?.whatsapp_opt_in === true;

    if (optedIn && phone) {
      const waRes = await fetch(
        `${supabaseUrl}/functions/v1/send-whatsapp-message`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            farm_id: payload.farm_id,
            recipient_phone: phone,
            message_type: "heat_stress_alert",
            template_id: "heat_stress_alert",
            template_params: [
              payload.max_temp_forecast.toFixed(1),
              payload.farm_name,
            ],
          }),
        },
      );

      if (waRes.ok) {
        const waJson: { sent?: boolean } = await waRes
          .json()
          .catch(() => ({}));
        if (waJson.sent === true) {
          sentViaWhatsapp = true;
          if (alertId) {
            await supabase
              .from("weather_alerts")
              .update({ sent_via_whatsapp: true })
              .eq("id", alertId);
          }
        } else {
          console.warn(
            `WhatsApp not sent for farm ${payload.farm_id}:`,
            waJson,
          );
        }
      } else {
        const errText = await waRes
          .text()
          .catch(() => `HTTP ${waRes.status}`);
        console.warn(
          `send-whatsapp-message HTTP error for farm ${payload.farm_id}: ${waRes.status} — ${errText}`,
        );
      }
    }
  } catch (err) {
    console.warn(
      `Error sending WhatsApp heat alert for farm ${payload.farm_id}:`,
      err,
    );
  }

  return jsonResponse({
    alerted: true,
    alert_id: alertId,
    sent_via_push: sentViaPush,
    sent_via_whatsapp: sentViaWhatsapp,
  });
});
