// supabase/functions/send-daily-digest/index.ts
// pg_cron daily 14:30 UTC (20:00 IST) — Migration 20260519000007.
// Auth: service-role Bearer token only.
//
// Phase 4.4 — enriched digest. Per farm it now folds:
//   • today's mortality + feed (as before)
//   • prices: broiler (state) + NECC zonal egg rate (zone)
//   • receivables: outstanding buyer balance
//   • the top Smart Insight (week-over-week), copy mirrored from
//     packages/shared/src/insights.ts INSIGHT_EN (Deno can't import the shared TS
//     — keep the strings + thresholds below in sync).
//
// Delivery:
//   • PUSH (send-push-notification) to every farm with an owner token — carries
//     the full enriched body (no template limit).
//   • WhatsApp (send-whatsapp-message) to opt-in owners — the approved 4-param
//     `daily_digest` template; we enrich only the price param value (can't add
//     placeholders to an approved template).

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonResponse = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

// ── Insights mirror (subset of packages/shared/src/insights.ts) ────────────────
const INSIGHT_EN: Record<string, string> = {
  fcr_up: "FCR drifting up: {{from}} → {{to}} week-over-week",
  fcr_down: "FCR improving: {{from}} → {{to}}",
  mortality_up: "Mortality rising: {{dr}} deaths this week vs {{dp}} last",
  mortality_down: "Mortality easing: {{dr}} vs {{dp}} last week",
  feed_anomaly: "Feed up {{pct}}% but weight flat — check wastage/theft/illness",
  hdep_down: "Egg production dropped: HDEP {{from}}% → {{to}}%",
};
const FCR_DELTA_MIN = 0.08;
const MORT_PCT_DELTA_MIN = 0.5;
const FEED_ANOMALY_MIN_PCT = 15;
const PRODUCTION_DROP_MIN_PCT = 5;
const DAY_MS = 86400000;
const interp = (t: string, p: Record<string, string | number>) =>
  t.replace(/\{\{(\w+)\}\}/g, (_, k) => (p[k] != null ? String(p[k]) : ""));

interface LogRow {
  log_date: string;
  birds_dead: number | null;
  feed_consumed_kg: number | null;
  eggs_collected: number | null;
  avg_bird_weight_g: number | null;
}
interface BatchAgg {
  poultry_type: string;
  current_bird_count: number;
  opening_bird_count: number;
  logs: LogRow[];
}

function agg(rows: LogRow[]) {
  let deaths = 0, feedKg = 0, eggs = 0, days = 0, firstW: number | null = null, lastW: number | null = null;
  for (const r of [...rows].sort((a, b) => (a.log_date < b.log_date ? -1 : 1))) {
    days++; deaths += Number(r.birds_dead ?? 0); feedKg += Number(r.feed_consumed_kg ?? 0); eggs += Number(r.eggs_collected ?? 0);
    const w = r.avg_bird_weight_g;
    if (w != null && Number(w) > 0) { if (firstW === null) firstW = Number(w); lastW = Number(w); }
  }
  return { deaths, feedKg, eggs, days, firstW, lastW };
}
function windowFcr(a: ReturnType<typeof agg>, birds: number): number | null {
  if (a.firstW === null || a.lastW === null || birds <= 0) return null;
  const gain = ((a.lastW - a.firstW) / 1000) * birds;
  if (gain <= 0 || a.feedKg <= 0) return null;
  return a.feedKg / gain;
}

/** Top single insight line for a farm, or null. Mirrors the shared engine's rules. */
function topInsight(batches: BatchAgg[]): string | null {
  let best: { score: number; text: string } | null = null;
  const consider = (score: number, text: string) => { if (!best || score > best.score) best = { score, text }; };
  for (const b of batches) {
    const anchor = b.logs.reduce((m, r) => (r.log_date > m ? r.log_date : m), b.logs[0]?.log_date ?? "");
    if (!anchor) continue;
    const aMs = new Date(`${anchor}T00:00:00Z`).getTime();
    const recent = b.logs.filter((r) => { const t = new Date(`${r.log_date}T00:00:00Z`).getTime(); return t >= aMs - 6 * DAY_MS && t <= aMs; });
    const prior = b.logs.filter((r) => { const t = new Date(`${r.log_date}T00:00:00Z`).getTime(); return t >= aMs - 13 * DAY_MS && t < aMs - 6 * DAY_MS; });
    if (recent.length === 0 || prior.length === 0) continue;
    const r = agg(recent), p = agg(prior);
    const birds = b.current_bird_count > 0 ? b.current_bird_count : b.opening_bird_count;

    if (b.poultry_type !== "layer") {
      const rf = windowFcr(r, birds), pf = windowFcr(p, birds);
      if (rf !== null && pf !== null && Math.abs(rf - pf) >= FCR_DELTA_MIN) {
        const worse = rf > pf;
        consider(worse ? 60 : 30, interp(INSIGHT_EN[worse ? "fcr_up" : "fcr_down"], { from: pf.toFixed(2), to: rf.toFixed(2) }));
      }
      if (p.feedKg > 0) {
        const up = ((r.feedKg - p.feedKg) / p.feedKg) * 100;
        const flat = r.firstW !== null && r.lastW !== null && r.lastW - r.firstW <= 0;
        if (up >= FEED_ANOMALY_MIN_PCT && flat) consider(95, interp(INSIGHT_EN.feed_anomaly, { pct: up.toFixed(0) }));
      }
    }
    if (birds > 0) {
      const rm = (r.deaths / birds) * 100, pm = (p.deaths / birds) * 100;
      if (Math.abs(rm - pm) >= MORT_PCT_DELTA_MIN) {
        const worse = rm > pm;
        consider(worse ? 70 : 25, interp(INSIGHT_EN[worse ? "mortality_up" : "mortality_down"], { dr: r.deaths, dp: p.deaths }));
      }
    }
    if (b.poultry_type === "layer" && birds > 0 && r.days > 0 && p.days > 0) {
      const rh = (r.eggs / (birds * r.days)) * 100, ph = (p.eggs / (birds * p.days)) * 100;
      if (ph - rh >= PRODUCTION_DROP_MIN_PCT) consider(72, interp(INSIGHT_EN.hdep_down, { from: ph.toFixed(0), to: rh.toFixed(0) }));
    }
  }
  return best ? (best as { text: string }).text : null;
}

function extractProfile(profiles: unknown): { full_name: string | null; whatsapp_phone: string | null; whatsapp_opt_in: boolean } | null {
  if (Array.isArray(profiles)) return (profiles[0] as any) ?? null;
  return (profiles as any) ?? null;
}

async function enrich(supabase: SupabaseClient, farm: any, todayStr: string) {
  // Today's mortality + feed
  const { data: todayLogs } = await supabase
    .from("daily_logs").select("birds_dead, feed_consumed_kg").eq("farm_id", farm.id).eq("log_date", todayStr);
  const mortality = (todayLogs ?? []).reduce((s, r) => s + Number(r.birds_dead ?? 0), 0);
  const feedKg = (todayLogs ?? []).reduce((s, r) => s + Number(r.feed_consumed_kg ?? 0), 0);

  // Prices
  let broiler = "N/A";
  if (farm.state) {
    const { data } = await supabase.from("market_prices").select("broiler_price_per_kg").eq("state", farm.state).order("price_date", { ascending: false }).limit(1).maybeSingle();
    if (data?.broiler_price_per_kg != null) broiler = String(data.broiler_price_per_kg);
  }
  let egg: string | null = null;
  if (farm.necc_zone) {
    const { data } = await supabase.from("necc_egg_rates").select("rate_per_100").eq("zone", farm.necc_zone).order("price_date", { ascending: false }).limit(1).maybeSingle();
    if (data?.rate_per_100 != null) egg = String(data.rate_per_100);
  }

  // Receivables (sum of positive buyer balances)
  const { data: buyers } = await supabase.from("buyers").select("current_balance").eq("farm_id", farm.id);
  const receivables = (buyers ?? []).reduce((s, b) => s + Math.max(0, Number(b.current_balance ?? 0)), 0);

  // Top insight over active batches
  const { data: activeBatches } = await supabase
    .from("batches").select("id, poultry_type, current_bird_count, opening_bird_count").eq("farm_id", farm.id).eq("status", "active");
  let insight: string | null = null;
  const bIds = (activeBatches ?? []).map((b) => b.id);
  if (bIds.length) {
    const sinceIso = new Date(Date.now() - 14 * DAY_MS).toISOString().slice(0, 10);
    const { data: logs } = await supabase
      .from("daily_logs").select("batch_id, log_date, birds_dead, feed_consumed_kg, eggs_collected, avg_bird_weight_g")
      .in("batch_id", bIds).gte("log_date", sinceIso);
    const byBatch = new Map<string, LogRow[]>();
    for (const l of (logs ?? []) as any[]) { const a = byBatch.get(l.batch_id) ?? []; a.push(l); byBatch.set(l.batch_id, a); }
    insight = topInsight((activeBatches ?? []).map((b) => ({
      poultry_type: b.poultry_type, current_bird_count: Number(b.current_bird_count ?? 0), opening_bird_count: Number(b.opening_bird_count ?? 0),
      logs: byBatch.get(b.id) ?? [],
    })));
  }

  return { mortality, feedKg, broiler, egg, receivables, insight };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!((token && token === serviceRoleKey) || (apikeyHeader && apikeyHeader === serviceRoleKey)))
    return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: farmRows, error: farmsError } = await supabase
    .from("farms")
    .select("id, farm_name, state, necc_zone, profiles!farms_owner_id_fkey(full_name, whatsapp_phone, whatsapp_opt_in)");
  if (farmsError) return jsonResponse({ error: "Failed to fetch farms", details: farmsError.message }, 500);

  const todayStr = new Date().toISOString().slice(0, 10);
  const whatsappUrl = `${supabaseUrl}/functions/v1/send-whatsapp-message`;
  const pushUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
  let farms_processed = 0;
  let digests_sent = 0;
  let pushes_sent = 0;

  for (const farm of (farmRows ?? []) as any[]) {
    farms_processed++;
    const profile = extractProfile(farm.profiles);
    try {
      const e = await enrich(supabase, farm, todayStr);
      const ownerName = profile?.full_name ?? farm.farm_name ?? "Farmer";

      // Enriched PUSH body (no template constraint).
      const parts = [`${e.mortality} mortality, ${e.feedKg.toFixed(1)} kg feed today`];
      const priceBits = [`broiler ₹${e.broiler}/kg`];
      if (e.egg) priceBits.push(`egg ₹${e.egg}/100`);
      parts.push(priceBits.join(", "));
      if (e.receivables > 0) parts.push(`₹${Math.round(e.receivables).toLocaleString("en-IN")} receivable`);
      if (e.insight) parts.push(e.insight);
      const pushBody = parts.join(" · ");

      const pushRes = await fetch(pushUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ farm_id: farm.id, title: `${farm.farm_name} — today`, body: pushBody, data: { type: "daily_digest" } }),
      });
      if (pushRes.ok) pushes_sent++;

      // WhatsApp (opt-in only) — approved 4-param template; enrich the price param.
      if (profile?.whatsapp_opt_in === true && profile.whatsapp_phone?.trim()) {
        const priceParam = e.egg ? `${e.broiler}/kg, egg ₹${e.egg}/100` : e.broiler;
        const waRes = await fetch(whatsappUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            farm_id: farm.id,
            recipient_phone: profile.whatsapp_phone,
            message_type: "daily_digest",
            template_id: "daily_digest",
            template_params: [ownerName, String(e.mortality), e.feedKg.toFixed(1), priceParam],
          }),
        });
        if (waRes.ok) {
          const waJson: { sent?: boolean } = await waRes.json().catch(() => ({}));
          if (waJson.sent === true) digests_sent++;
        } else {
          console.warn(`WhatsApp digest failed for farm ${farm.id}: ${waRes.status}`);
        }
      }
    } catch (err) {
      console.warn(`Digest failed for farm ${farm.id}:`, err);
    }
  }

  return jsonResponse({ farms_processed, digests_sent, pushes_sent });
});
