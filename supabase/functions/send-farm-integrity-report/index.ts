// supabase/functions/send-farm-integrity-report/index.ts
// Weekly Owner Trust / "Farm Integrity" summary.
// Triggered by pg_cron Monday 09:00 IST (see
// 20260616000005_schedule_farm_integrity_cron.sql). Manual: POST { farm_id? }.
//
// For each farm it reconciles what was LOGGED against physical spot-counts and
// biology, then pushes a concise, NON-ACCUSATORY summary to the OWNER only
// (send-push-notification resolves the owner's expo token; physical_counts is
// owner-only anyway). Sends only when there is something to review.
//
// Delivery: PUSH. A WhatsApp send would require a Meta-approved template
// ('farm_integrity') which does not exist yet — submit via AiSensy then add a
// send-whatsapp-message call here. We never invent template IDs.
//
// The reconciliation thresholds mirror packages/shared/src/farm-integrity.ts
// (the Deno runtime can't import the shared TS) — keep them in sync.
//
// Auth: service-role Bearer token only.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

const WINDOW_DAYS = 14;
const inr = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;

// Minimal breed → standard FCR (mirrors the common entries in breed-benchmarks).
const BREED_FCR: Record<string, number> = {
  "cobb 500": 1.6, "cobb 700": 1.7, "ross 308": 1.55, "vencobb 400": 1.65, "vencobb": 1.65,
};
function standardFcr(breed: string | null): number {
  if (!breed) return 1.7;
  const k = breed.trim().toLowerCase();
  for (const [name, fcr] of Object.entries(BREED_FCR)) if (k.includes(name)) return fcr;
  return 1.7;
}

async function reportForFarm(supabase: SupabaseClient, farmId: string): Promise<string[]> {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
  const lines: string[] = [];

  const [{ data: batches }, { data: items }, { data: counts }] = await Promise.all([
    supabase.from("batches").select("id, breed_name, opening_bird_count, current_bird_count, cost_per_bird").eq("farm_id", farmId).eq("status", "active"),
    supabase.from("inventory_items").select("id, item_name, current_stock").eq("farm_id", farmId).eq("category", "feed"),
    supabase.from("physical_counts").select("batch_id, item_id, count_type, counted_value, count_date").eq("farm_id", farmId).order("count_date", { ascending: false }),
  ]);

  const activeBatches = (batches ?? []) as any[];
  const feedItems = (items ?? []) as any[];
  const physical = (counts ?? []) as any[];

  const latestItem = new Map<string, number>();
  const latestBatch = new Map<string, number>();
  for (const c of physical) {
    if (c.count_type === "feed_stock" && c.item_id && !latestItem.has(c.item_id)) latestItem.set(c.item_id, Number(c.counted_value));
    if (c.count_type === "bird_count" && c.batch_id && !latestBatch.has(c.batch_id)) latestBatch.set(c.batch_id, Number(c.counted_value));
  }

  const batchIds = activeBatches.map((b) => b.id);
  const { data: wLogs } = batchIds.length
    ? await supabase.from("daily_logs").select("batch_id, log_date, created_at, feed_consumed_kg, feed_cost_per_kg, avg_bird_weight_g").in("batch_id", batchIds).gte("log_date", sinceIso).order("log_date", { ascending: true })
    : { data: [] as any[] };
  const logs = (wLogs ?? []) as any[];
  const feedCost = logs.filter((l) => Number(l.feed_cost_per_kg) > 0).map((l) => Number(l.feed_cost_per_kg)).pop() ?? 30;

  // 1. Feed variance (per item with a physical count)
  for (const it of feedItems) {
    const phys = latestItem.get(it.id);
    if (phys == null) continue;
    const variance = phys - Number(it.current_stock ?? 0);
    if (-variance > 10) lines.push(`Feed ${it.item_name}: ${Math.round(-variance)} kg short (${inr(variance * feedCost)})`);
  }

  // 2. Feed-to-growth + 3. bird-count + 4. entry behaviour (per batch)
  for (const b of activeBatches) {
    const bl = logs.filter((l) => l.batch_id === b.id);
    const weighed = bl.filter((l) => Number(l.avg_bird_weight_g) > 0);
    const feed = bl.reduce((s, l) => s + Number(l.feed_consumed_kg ?? 0), 0);
    const gain = weighed.length >= 2
      ? ((Number(weighed[weighed.length - 1].avg_bird_weight_g) - Number(weighed[0].avg_bird_weight_g)) / 1000) * Number(b.current_bird_count ?? 0)
      : 0;
    if (gain > 0) {
      const std = standardFcr(b.breed_name);
      const fcr = feed / gain;
      if (fcr > std * 1.15) {
        const excess = Math.max(0, feed - gain * std);
        lines.push(`${b.breed_name ?? "Batch"}: FCR ${fcr.toFixed(2)} vs ${std} (${inr(excess * feedCost)} extra feed)`);
      }
    }
    const phys = latestBatch.get(b.id);
    if (phys != null) {
      const variance = phys - Number(b.current_bird_count ?? 0);
      if (-variance > 5) lines.push(`${b.breed_name ?? "Batch"}: ${Math.round(-variance)} fewer birds than recorded (${inr(variance * Number(b.cost_per_bird ?? 0))})`);
    }
    // backfills
    let backfilled = 0;
    for (const l of bl) {
      const c = new Date(l.created_at).getTime();
      const d = new Date(`${l.log_date}T00:00:00Z`).getTime();
      if (c - d > 2 * 86400000) backfilled++;
    }
    if (backfilled >= 2) lines.push(`${b.breed_name ?? "Batch"}: ${backfilled} logs backfilled late`);
  }

  return lines;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!((token && token === serviceRoleKey) || (apikeyHeader && apikeyHeader === serviceRoleKey)))
    return json({ error: "Unauthorized" }, 401);

  let singleFarm: string | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body?.farm_id) singleFarm = String(body.farm_id);
  } catch { /* optional */ }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let q = supabase.from("farms").select("id, farm_name");
  if (singleFarm) q = q.eq("id", singleFarm);
  const { data: farms, error } = await q;
  if (error) return json({ error: "Failed to fetch farms", details: error.message }, 500);

  const pushUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
  let processed = 0;
  let sent = 0;

  for (const farm of (farms ?? []) as any[]) {
    processed++;
    try {
      const lines = await reportForFarm(supabase, farm.id);
      if (lines.length === 0) continue;
      const body = `${lines.slice(0, 3).join(" · ")}${lines.length > 3 ? ` (+${lines.length - 3} more)` : ""}. Open Farm Integrity to review.`;
      const res = await fetch(pushUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({
          farm_id: farm.id,
          title: "Farm Integrity — items to review",
          body,
          data: { type: "farm_integrity", route: "/farm-integrity" },
        }),
      });
      if (res.ok) sent++;
      else console.warn(`push failed for farm ${farm.id}: ${res.status}`);
    } catch (err) {
      console.warn(`farm-integrity report failed for ${farm.id}:`, err);
    }
  }

  return json({ farms_processed: processed, reports_sent: sent });
});
