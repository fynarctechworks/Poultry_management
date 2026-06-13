// supabase/functions/razorpay-plan-backfill/index.ts
//
// One-shot setup: for every active priced plan, create the matching Razorpay
// Plan objects (monthly + yearly) and store their ids on
// subscription_plans.razorpay_plan_id_monthly / _yearly. Idempotent — skips a
// cycle that already has an id. Free / contact-us plans (price 0) are skipped.
//
// Run once per environment after setting Razorpay keys (test, then live):
//   POST /functions/v1/razorpay-plan-backfill   (operator JWT with
//   subscription:manage, or the service role key as bearer).
//
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

async function createRazorpayPlan(auth: string, period: "monthly" | "yearly", name: string, amountInr: number): Promise<string | null> {
  const res = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: auth },
    body: JSON.stringify({
      period, interval: 1,
      item: { name: `${name} (${period})`, amount: Math.round(amountInr * 100), currency: "INR" },
    }),
  });
  if (!res.ok) { console.warn(`Razorpay plan create failed (${name}/${period}):`, await res.text().catch(() => res.status)); return null; }
  const j = await res.json() as { id?: string };
  return j.id ?? null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Authorize: service-role bearer, or operator with subscription:manage.
  if (token !== serviceRoleKey) {
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: ok } = await userClient.rpc("platform_has_permission", { p_perm: "subscription:manage" });
    if (!ok) return json({ error: "Forbidden", reason: "subscription:manage required" }, 403);
  }

  const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  if (!keyId || !keySecret) return json({ ok: false, reason: "not_configured" });
  const auth = "Basic " + btoa(`${keyId}:${keySecret}`);

  const { data: plans, error } = await svc.from("subscription_plans")
    .select("id, code, name, monthly_price_inr, yearly_price_inr, razorpay_plan_id_monthly, razorpay_plan_id_yearly")
    .eq("is_active", true);
  if (error) return json({ ok: false, error: error.message }, 500);

  const results: Record<string, unknown>[] = [];
  for (const p of plans ?? []) {
    const update: Record<string, string> = {};
    if (Number(p.monthly_price_inr) > 0 && !p.razorpay_plan_id_monthly) {
      const id = await createRazorpayPlan(auth, "monthly", p.name, Number(p.monthly_price_inr));
      if (id) update.razorpay_plan_id_monthly = id;
    }
    if (Number(p.yearly_price_inr) > 0 && !p.razorpay_plan_id_yearly) {
      const id = await createRazorpayPlan(auth, "yearly", p.name, Number(p.yearly_price_inr));
      if (id) update.razorpay_plan_id_yearly = id;
    }
    if (Object.keys(update).length) {
      await svc.from("subscription_plans").update(update).eq("id", p.id);
      results.push({ code: p.code, ...update });
    } else {
      results.push({ code: p.code, skipped: true });
    }
  }

  return json({ ok: true, plans: results });
});
