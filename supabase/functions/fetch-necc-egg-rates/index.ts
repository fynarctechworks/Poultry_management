// supabase/functions/fetch-necc-egg-rates/index.ts
// Triggered by pg_cron daily at 08:00 IST (see migration
// 20260616000003_schedule_necc_egg_rates_cron.sql). Can also be called manually:
//   POST { date?: "YYYY-MM-DD" }  (defaults to today, IST)
//
// Flow:
//   1. Fetch NECC zonal egg rates from a configurable source (NECC_RATES_URL).
//   2. UPSERT into necc_egg_rates (zone, price_date) with source='necc'.
//
// Resilience (the explicit Phase 4.2 requirement): NECC has no stable official
// API and scrapers break. Any failure — missing NECC_RATES_URL, network error,
// bad payload, zero parsable rows — is logged and returned as a 200 no-op, NOT
// an error. The cron must not flap, and the apps already render "price
// unavailable" / last-known when no fresh row exists. This function never
// invents data.
//
// Expected NECC_RATES_URL payload (a small adapter you control, not NECC's HTML):
//   { "date": "YYYY-MM-DD", "rates": [ { "zone": "Namakkal", "ratePer100": 560 }, ... ] }
//
// Auth: service-role Bearer token only.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });

interface NeccRate {
  zone: string;
  ratePer100: number;
}

/** Today's date in Asia/Kolkata as YYYY-MM-DD. */
function istToday(): string {
  const now = new Date();
  // IST = UTC+5:30
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/** Parse a source payload into clean rate rows; tolerant of shape drift. */
function parseRates(payload: unknown): NeccRate[] {
  const arr = Array.isArray(payload)
    ? payload
    : (payload as { rates?: unknown })?.rates;
  if (!Array.isArray(arr)) return [];
  const out: NeccRate[] = [];
  for (const r of arr) {
    const zone = String((r as any)?.zone ?? "").trim();
    const raw = (r as any)?.ratePer100 ?? (r as any)?.rate_per_100 ?? (r as any)?.rate;
    const rate = Number(raw);
    if (zone && Number.isFinite(rate) && rate > 0) {
      out.push({ zone, ratePer100: rate });
    }
  }
  return out;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");
  const providedToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isAuthorized =
    (providedToken && providedToken === serviceRoleKey) ||
    (apikeyHeader && apikeyHeader === serviceRoleKey);
  if (!isAuthorized) return json({ error: "Unauthorized" }, 401);

  // Optional date override
  let priceDate = istToday();
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
      priceDate = body.date;
    }
  } catch {
    /* body optional */
  }

  const sourceUrl = Deno.env.get("NECC_RATES_URL");
  if (!sourceUrl) {
    // Graceful no-op — not an error. The apps fall back to last-known / unavailable.
    console.warn("NECC_RATES_URL not configured — skipping NECC fetch (price unavailable fallback).");
    return json({ updated: 0, skipped: "NECC_RATES_URL not configured" });
  }

  // Fetch the source (resilient)
  let rates: NeccRate[] = [];
  try {
    const res = await fetch(sourceUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.warn(`NECC source returned ${res.status} — treating as unavailable.`);
      return json({ updated: 0, skipped: `source HTTP ${res.status}` });
    }
    const payload = await res.json().catch(() => null);
    rates = parseRates(payload);
  } catch (err) {
    console.warn("NECC source fetch/parse failed — treating as unavailable:", err);
    return json({ updated: 0, skipped: "source unavailable" });
  }

  if (rates.length === 0) {
    console.warn("NECC source returned no parsable rates — nothing to upsert.");
    return json({ updated: 0, skipped: "no parsable rates" });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const rows = rates.map((r) => ({
    zone: r.zone,
    price_date: priceDate,
    rate_per_100: r.ratePer100,
    source: "necc",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("necc_egg_rates")
    .upsert(rows, { onConflict: "zone,price_date" });

  if (error) {
    console.error("necc_egg_rates upsert failed:", error.message);
    return json({ error: "upsert failed", details: error.message }, 500);
  }

  return json({ updated: rows.length, price_date: priceDate });
});
