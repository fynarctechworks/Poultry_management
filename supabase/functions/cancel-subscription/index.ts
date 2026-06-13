// supabase/functions/cancel-subscription/index.ts
//
// Cancels a tenant's Razorpay subscription. Per the product rule, cancellation
// is allowed ONLY while the subscription is in 'trial' (after the trial, the
// cancel option is hidden and this endpoint refuses with 409).
//
// Auth: tenant owner JWT.  Body: {}  (tenant resolved from the caller).
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

  const { data: tenant } = await svc.from("tenants").select("id").eq("owner_id", user.id).maybeSingle();
  if (!tenant) return json({ error: "Only the tenant owner can cancel" }, 403);

  const { data: ts } = await svc.from("tenant_subscriptions")
    .select("id, status, razorpay_subscription_id").eq("tenant_id", tenant.id).maybeSingle();
  if (!ts) return json({ error: "No subscription" }, 404);
  if (ts.status !== "trial") {
    return json({ error: "cancel_not_allowed", reason: "Cancellation is only available during the trial period." }, 409);
  }

  // Cancel at Razorpay (immediate) if a subscription exists there.
  if (ts.razorpay_subscription_id) {
    const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
    if (keyId && keySecret) {
      try {
        const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${ts.razorpay_subscription_id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
          body: JSON.stringify({ cancel_at_cycle_end: 0 }),
        });
        if (!res.ok) console.warn("Razorpay cancel failed:", await res.text().catch(() => res.status));
      } catch (e) { console.warn("Razorpay cancel error:", e); }
    }
  }

  // Flip to cancelled (writes history + mirrors tenants.status + stamps trial_cancelled_at).
  await svc.rpc("set_subscription_status", {
    p_tenant_id: tenant.id, p_status: "cancelled", p_reason: "Cancelled during trial by owner", p_actor: "user",
  });

  return json({ ok: true, status: "cancelled" });
});
