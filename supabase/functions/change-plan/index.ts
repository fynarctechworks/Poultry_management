// supabase/functions/change-plan/index.ts
//
// Upgrade/downgrade a tenant's plan. When a live Razorpay subscription exists we
// ask Razorpay to switch the plan immediately (schedule_change_at='now'), which
// applies proration on the next charge; we then mirror plan_id/cycle locally.
// When no Razorpay subscription exists yet (still in trial, mandate not set up),
// we just switch the local plan so the eventual first charge uses the new plan.
//
// Auth: tenant owner JWT. Body: { plan_code, billing_cycle }.
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
//      RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
const Body = z.object({ plan_code: z.string().min(1), billing_cycle: z.enum(["monthly", "yearly"]) });
const TOTAL_COUNT: Record<string, number> = { monthly: 60, yearly: 10 };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
  });
  const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user) return json({ error: "Unauthorized" }, 401);

  let raw: unknown; try { raw = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const p = Body.safeParse(raw);
  if (!p.success) return json({ error: p.error.flatten() }, 400);
  const { plan_code, billing_cycle } = p.data;

  const { data: tenant } = await svc.from("tenants").select("id").eq("owner_id", user.id).maybeSingle();
  if (!tenant) return json({ error: "Only the tenant owner can change the plan" }, 403);

  const { data: plan } = await svc.from("subscription_plans")
    .select("id, code, name, razorpay_plan_id_monthly, razorpay_plan_id_yearly")
    .eq("code", plan_code).eq("is_active", true).maybeSingle();
  if (!plan) return json({ error: "Plan not found" }, 404);

  const { data: ts } = await svc.from("tenant_subscriptions")
    .select("id, status, billing_cycle, plan_id, razorpay_subscription_id").eq("tenant_id", tenant.id).maybeSingle();
  if (!ts) return json({ error: "No subscription" }, 404);

  const newRazorpayPlanId = billing_cycle === "monthly" ? plan.razorpay_plan_id_monthly : plan.razorpay_plan_id_yearly;

  // If a live Razorpay subscription exists, switch its plan immediately (prorated).
  let razorpayUpdated = false;
  if (ts.razorpay_subscription_id && newRazorpayPlanId) {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
    if (keyId && keySecret) {
      try {
        const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${ts.razorpay_subscription_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
          body: JSON.stringify({
            plan_id: newRazorpayPlanId,
            schedule_change_at: "now",
            remaining_count: TOTAL_COUNT[billing_cycle] ?? 12,
          }),
        });
        razorpayUpdated = res.ok;
        if (!res.ok) console.warn("Razorpay plan change failed:", await res.text().catch(() => res.status));
      } catch (e) { console.warn("Razorpay plan change error:", e); }
    }
  }

  // Mirror locally + history.
  await svc.from("tenant_subscriptions")
    .update({ plan_id: plan.id, billing_cycle, updated_at: new Date().toISOString() })
    .eq("id", ts.id);
  await svc.from("subscription_history").insert({
    tenant_id: tenant.id, subscription_id: ts.id, from_status: ts.status, to_status: ts.status,
    reason: `Plan changed to ${plan.name} (${billing_cycle})`, actor: "user",
    metadata_json: { plan_code, billing_cycle, razorpay_updated: razorpayUpdated },
  });

  return json({ ok: true, plan_code, billing_cycle, razorpay_updated: razorpayUpdated });
});
