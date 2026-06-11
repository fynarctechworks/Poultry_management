// supabase/functions/fetch-weather-data/index.ts
// Triggered by pg_cron every 4 hours (see migration 20260519000002_schedule_weather_cron.sql).
// Can also be called manually: POST with optional body { farm_id?: string } to
// limit processing to a single farm.
//
// Flow per farm:
//   1. Fetch weather from OpenWeatherMap One Call 3.0
//   2. UPSERT into weather_data (one row per farm — ON CONFLICT farm_id DO UPDATE)
//   3. If max temp in next 24h > heat_stress_threshold_celsius:
//      a. Prevent duplicate alerts (check weather_alerts for same farm+date)
//      b. INSERT into weather_alerts
//      c. Call send-push-notification Edge Function
//
// Auth: service-role Bearer token only.
// Rate limit: OpenWeatherMap free tier = 1,000 calls/day.
//   At 6 calls/day × 166 farms ≈ 996 calls/day. 200 farms × 6 calls = 1200 (over limit).
//   MVP: run every 4h (6×/day). Keep farm count <= 160 on free tier. Warn in logs.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const BodySchema = z.object({
  farm_id: z.string().uuid().optional(),
}).optional();

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
// OpenWeatherMap response types (minimal surface)
// ---------------------------------------------------------------------------
interface OWMHourly {
  dt: number; // Unix timestamp
  temp: number;
  humidity: number;
  weather: Array<{ description: string }>;
  feels_like?: number;
  wind_speed?: number;
}

interface OWMResponse {
  current: {
    temp: number;
    humidity: number;
  };
  hourly: OWMHourly[];
}

// ---------------------------------------------------------------------------
// Farm row type
// ---------------------------------------------------------------------------
interface Farm {
  id: string;
  farm_name: string;
  latitude: number;
  longitude: number;
  heat_stress_threshold_celsius: number;
}

// ---------------------------------------------------------------------------
// Mitigation actions based on severity
// ---------------------------------------------------------------------------
function buildMitigationActions(maxTemp: number, threshold: number): string[] {
  const actions = [
    "Increase water access — at least 3× normal consumption expected",
    "Run foggers or misters every 2 hours between 10 AM and 4 PM",
    "Reduce feed quantity by 10–20% during peak heat (11 AM–3 PM)",
    "Ensure all ventilation fans are operational",
    "Apply electrolytes (Vitamin C + electrolyte solution) in water",
    "Monitor mortality hourly during peak heat window",
  ];
  if (maxTemp > threshold + 3) {
    // Critical severity
    actions.push(
      "CRITICAL: Consider emergency harvest if temp exceeds " +
        (threshold + 5).toFixed(1) +
        "°C — contact integrator/buyer immediately",
      "Add ice blocks to water troughs",
    );
  }
  return actions;
}

// ---------------------------------------------------------------------------
// Process a single farm
// ---------------------------------------------------------------------------
async function processFarm(
  farm: Farm,
  supabase: SupabaseClient,
  owmApiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string,
): Promise<{ farmId: string; alertTriggered: boolean; error?: string }> {
  const { id: farmId, farm_name, latitude, longitude, heat_stress_threshold_celsius } = farm;

  // -------------------------------------------------------------------------
  // 1. Fetch from OpenWeatherMap One Call 3.0
  // -------------------------------------------------------------------------
  let owmData: OWMResponse;
  try {
    const owmUrl =
      `https://api.openweathermap.org/data/3.0/onecall` +
      `?lat=${latitude}&lon=${longitude}` +
      `&exclude=minutely,daily,alerts` +
      `&units=metric` +
      `&appid=${owmApiKey}`;

    const owmRes = await fetch(owmUrl);
    if (!owmRes.ok) {
      const errText = await owmRes.text();
      console.warn(`OWM error for farm ${farmId}: ${owmRes.status} ${errText}`);
      return { farmId, alertTriggered: false, error: `OWM ${owmRes.status}` };
    }
    owmData = await owmRes.json() as OWMResponse;
  } catch (err) {
    console.warn(`Network error fetching weather for farm ${farmId}:`, err);
    return { farmId, alertTriggered: false, error: "Network error" };
  }

  // -------------------------------------------------------------------------
  // 2. Extract data — next 72 hours of hourly forecasts
  // -------------------------------------------------------------------------
  const currentTemp = owmData.current?.temp ?? 0;
  const currentHumidity = owmData.current?.humidity ?? 0;
  // Keep next 72 hours (max 48 in free OWM, but use what's available)
  const forecastHourly: OWMHourly[] = (owmData.hourly ?? []).slice(0, 72);
  const forecastJson = forecastHourly;

  // Pre-compute next 24h slice (used for both max_temp_today and alert check)
  const next24hHourly = forecastHourly.slice(0, 24);

  // max_temp_today: max of current temp + next 24h forecasts (24h window ≈ rest of today)
  // Regular column — not GENERATED (JSONB-derived GENERATED columns fail on PG 15+, see L1)
  const maxTempToday = next24hHourly.reduce(
    (max: number, h: OWMHourly) => Math.max(max, h.temp),
    currentTemp,
  );

  // -------------------------------------------------------------------------
  // 3. UPSERT into weather_data (one row per farm, unique on farm_id)
  //    Requires UNIQUE constraint on farm_id (added in migration 20260519000002).
  // -------------------------------------------------------------------------

  const { error: upsertError } = await supabase
    .from("weather_data")
    .upsert(
      {
        farm_id: farmId,
        fetched_at: new Date().toISOString(),
        current_temp_c: currentTemp,
        current_humidity: currentHumidity,
        forecast_json: forecastJson,
        max_temp_today: maxTempToday,
        heat_stress_alert_triggered: false, // will be updated if alert fires
      },
      { onConflict: "farm_id" },
    );

  if (upsertError) {
    console.warn(`weather_data upsert failed for farm ${farmId}:`, upsertError.message);
    return { farmId, alertTriggered: false, error: upsertError.message };
  }

  // -------------------------------------------------------------------------
  // 4. Check heat-stress threshold over the next 24 hours
  //    next24hHourly and maxTempToday (= maxTemp24h) already computed in section 2
  // -------------------------------------------------------------------------
  const maxTemp24h = maxTempToday; // alias for clarity
  const avgHumidity24h = next24hHourly.length > 0
    ? next24hHourly.reduce((sum: number, h: OWMHourly) => sum + h.humidity, 0) / next24hHourly.length
    : currentHumidity;

  if (maxTemp24h <= heat_stress_threshold_celsius) {
    return { farmId, alertTriggered: false };
  }

  // -------------------------------------------------------------------------
  // 5. Heat-stress alert — delegate to send-heat-stress-alert.
  //    That function owns idempotency (same farm+date), weather_alerts insert,
  //    weather_data flag update, and the push + WhatsApp notifications.
  // -------------------------------------------------------------------------
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const severity = maxTemp24h > heat_stress_threshold_celsius + 3 ? "critical" : "warning";
  const mitigationActions = buildMitigationActions(maxTemp24h, heat_stress_threshold_celsius);

  try {
    const alertRes = await fetch(
      `${supabaseUrl}/functions/v1/send-heat-stress-alert`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          farm_id: farmId,
          farm_name,
          severity,
          max_temp_forecast: maxTemp24h,
          humidity_forecast: Math.round(avgHumidity24h),
          mitigation_actions: mitigationActions,
          alert_date: today,
        }),
      },
    );
    if (!alertRes.ok) {
      const errText = await alertRes.text().catch(() => `HTTP ${alertRes.status}`);
      console.warn(
        `send-heat-stress-alert failed for farm ${farmId}: ${alertRes.status} — ${errText}`,
      );
    }
  } catch (err) {
    console.warn(`Error calling send-heat-stress-alert for farm ${farmId}:`, err);
  }

  return { farmId, alertTriggered: true };
}

// ---------------------------------------------------------------------------
// Main handler
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
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
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
  // 2. Parse optional body
  // ---------------------------------------------------------------------------
  let singleFarmId: string | undefined;
  try {
    const rawBody = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(rawBody);
    if (parsed.success && parsed.data?.farm_id) {
      singleFarmId = parsed.data.farm_id;
    }
  } catch {
    // Body is optional — ignore parse errors
  }

  // ---------------------------------------------------------------------------
  // 3. Check required secrets
  // ---------------------------------------------------------------------------
  const owmApiKey = Deno.env.get("OPENWEATHERMAP_API_KEY");
  if (!owmApiKey) {
    console.error("OPENWEATHERMAP_API_KEY secret not set");
    return new Response(
      JSON.stringify({
        error: "OPENWEATHERMAP_API_KEY secret not configured",
        hint: "Run: supabase secrets set OPENWEATHERMAP_API_KEY=<your-key>",
      }),
      { status: 503, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Create Supabase service-role client
  // ---------------------------------------------------------------------------
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ---------------------------------------------------------------------------
  // 5. Fetch farms with valid coordinates
  // ---------------------------------------------------------------------------
  let query = supabase
    .from("farms")
    .select("id, farm_name, latitude, longitude, heat_stress_threshold_celsius")
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (singleFarmId) {
    query = query.eq("id", singleFarmId);
  }

  const { data: farms, error: farmsError } = await query;

  if (farmsError) {
    console.error("Error fetching farms:", farmsError.message);
    return new Response(
      JSON.stringify({ error: "Failed to fetch farms", details: farmsError.message }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  if (!farms || farms.length === 0) {
    return new Response(
      JSON.stringify({ farms_processed: 0, alerts_triggered: 0, message: "No farms with coordinates found" }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // OWM free tier quota warning
  if (farms.length > 160) {
    console.warn(
      `WARNING: ${farms.length} farms × 6 daily runs = ${farms.length * 6} OWM calls/day. ` +
        `Free tier limit is 1,000/day. Upgrade to OWM paid tier or reduce cron frequency.`,
    );
  }

  // ---------------------------------------------------------------------------
  // 6. Process farms sequentially (rate-limit safety)
  // ---------------------------------------------------------------------------
  let farmsProcessed = 0;
  let alertsTriggered = 0;
  const errors: Array<{ farmId: string; error: string }> = [];

  for (const farm of farms as Farm[]) {
    const result = await processFarm(
      farm,
      supabase,
      owmApiKey,
      supabaseUrl,
      serviceRoleKey,
    );
    farmsProcessed++;
    if (result.alertTriggered) alertsTriggered++;
    if (result.error) errors.push({ farmId: result.farmId, error: result.error });
  }

  // ---------------------------------------------------------------------------
  // 7. Return summary
  // ---------------------------------------------------------------------------
  return new Response(
    JSON.stringify({
      farms_processed: farmsProcessed,
      alerts_triggered: alertsTriggered,
      errors: errors.length > 0 ? errors : undefined,
    }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
