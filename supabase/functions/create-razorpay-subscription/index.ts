// supabase/functions/create-razorpay-subscription/index.ts
//
// Creates a Razorpay **Subscription** for a PoultryOS tenant, in the
// card-upfront / 7-day-trial / auto-charge model:
//
//   * The mandate (UPI Autopay / eMandate / card) is authorized NOW at checkout.
//   * `start_at` is set 7 days out, so the FIRST real charge auto-fires on day 7.
//   * The tenant stays status='trial' (trial_ends_at = start_at) until the
//     razorpay-webhook flips it to 'active' on the first `subscription.charged`.
//
// Called by: authenticated app users from the signup payment step / billing
//   portal upgrade. Auth: caller's user JWT.
//
// Flow:
//   1. Validate Bearer JWT.
//   2. Zod-validate body { plan_code, billing_cycle, trial_days? }.
//   3. Resolve user + tenant.
//   4. Look up plan + razorpay_plan_id for the cycle (graceful 200 if unconfigured).
//   5. Guard Razorpay creds (graceful 200 if not configured).
//   6. Ensure a Razorpay customer (from billing_profiles); store its id.
//   7. POST /v1/subscriptions with start_at = now + trial_days.
//   8. Record a payment_attempts row + attach subscription to tenant_subscriptions
//      (status stays trial; trial window = start_at).
//   9. Return { ok, subscription_id, key_id, short_url, trial_ends_at }.
//
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

const BodySchema = z.object({
  plan_code: z.string().min(1),
  billing_cycle: z.enum(["monthly", "yearly"]),
  // default 7-day trial; pass 0 for charge-now (no trial).
  trial_days: z.number().int().min(0).max(30).optional(),
});

interface RazorpaySubscriptionResponse {
  id: string;
  short_url?: string;
  status: string;
  start_at?: number;
}

// total_count: how many billing cycles the mandate is authorized for. High
// enough to feel "auto-recurring"; Razorpay caps monthly at 100.
const TOTAL_COUNT: Record<string, number> = { monthly: 60, yearly: 10 };

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  let rawBody: unknown;
  try { rawBody = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }
  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) return jsonResponse({ error: parsed.error.flatten() }, 400);
  const { plan_code, billing_cycle } = parsed.data;
  const trialDays = parsed.data.trial_days ?? 7;

  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);
  const userId = user.id;

  const { data: plan, error: planErr } = await userClient
    .from("subscription_plans")
    .select("id, code, name, monthly_price_inr, yearly_price_inr, razorpay_plan_id_monthly, razorpay_plan_id_yearly")
    .eq("code", plan_code)
    .eq("is_active", true)
    .maybeSingle();
  if (planErr || !plan) return jsonResponse({ error: "Plan not found" }, 404);

  const razorpayPlanId: string | null =
    billing_cycle === "monthly" ? (plan.razorpay_plan_id_monthly ?? null) : (plan.razorpay_plan_id_yearly ?? null);
  if (!razorpayPlanId) {
    return jsonResponse({
      ok: false,
      reason: "plan_not_configured",
      details: "Razorpay plan id is not yet configured for this billing cycle. Run scripts/razorpay-plan-backfill.",
    });
  }

  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  if (!razorpayKeyId || !razorpayKeySecret) {
    console.warn("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
    return jsonResponse({ ok: false, reason: "not_configured" });
  }
  const basicAuth = "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

  // Service-role client: resolve tenant, read/write billing profile + subscription.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return jsonResponse({ ok: false, reason: "not_configured" });
  const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // Resolve tenant: owned tenant first, else profile.tenant_id.
  let tenantId: string | null = null;
  const { data: ownedTenant } = await svc.from("tenants").select("id").eq("owner_id", userId).maybeSingle();
  tenantId = ownedTenant?.id ?? null;
  if (!tenantId) {
    const { data: prof } = await svc.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    tenantId = prof?.tenant_id ?? null;
  }
  if (!tenantId) return jsonResponse({ ok: false, reason: "no_tenant" }, 400);

  // ------------------------------------------------------------------
  // 6. Ensure a Razorpay customer from the billing profile (best-effort).
  // ------------------------------------------------------------------
  const { data: billing } = await svc
    .from("billing_profiles")
    .select("id, billing_name, email, phone, razorpay_customer_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  let razorpayCustomerId: string | null = billing?.razorpay_customer_id ?? null;
  if (!razorpayCustomerId && billing?.email) {
    try {
      const custRes = await fetch("https://api.razorpay.com/v1/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: basicAuth },
        body: JSON.stringify({
          name: billing.billing_name ?? undefined,
          email: billing.email ?? undefined,
          contact: (billing.phone ?? "").replace(/\D/g, "") || undefined,
          fail_existing: 0, // return existing customer instead of erroring
          notes: { tenant_id: tenantId },
        }),
      });
      if (custRes.ok) {
        const cust = await custRes.json() as { id?: string };
        razorpayCustomerId = cust.id ?? null;
        if (razorpayCustomerId) {
          await svc.from("billing_profiles").update({ razorpay_customer_id: razorpayCustomerId })
            .eq("tenant_id", tenantId);
        }
      } else {
        console.warn("Razorpay customer create failed:", await custRes.text().catch(() => custRes.status));
      }
    } catch (e) {
      console.warn("Razorpay customer create error:", e);
    }
  }

  // ------------------------------------------------------------------
  // 7. Create the subscription with a future start_at (the trial window).
  // ------------------------------------------------------------------
  const nowSec = Math.floor(Date.now() / 1000);
  const startAt = trialDays > 0 ? nowSec + trialDays * 86400 : undefined;
  const subscriptionPayload: Record<string, unknown> = {
    plan_id: razorpayPlanId,
    total_count: TOTAL_COUNT[billing_cycle] ?? 12,
    quantity: 1,
    customer_notify: 1,
    notes: { user_id: userId, tenant_id: tenantId, plan_code, billing_cycle },
  };
  if (startAt) subscriptionPayload.start_at = startAt;
  if (razorpayCustomerId) subscriptionPayload.customer_id = razorpayCustomerId;

  let razorpayRes: Response;
  try {
    razorpayRes = await fetch("https://api.razorpay.com/v1/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: basicAuth },
      body: JSON.stringify(subscriptionPayload),
    });
  } catch (err) {
    console.error("Razorpay network error:", err);
    return jsonResponse({ ok: false, reason: "network_error" }, 502);
  }
  if (!razorpayRes.ok) {
    const errText = await razorpayRes.text().catch(() => `HTTP ${razorpayRes.status}`);
    console.warn(`Razorpay error ${razorpayRes.status}: ${errText}`);
    // Record the failed attempt for funnel analytics.
    await svc.from("payment_attempts").insert({
      tenant_id: tenantId, plan_id: plan.id, billing_cycle,
      status: "failed", failure_reason: errText.slice(0, 500),
    });
    return jsonResponse({ ok: false, reason: "razorpay_error", status: razorpayRes.status, details: errText }, 502);
  }

  let subJson: RazorpaySubscriptionResponse;
  try { subJson = await razorpayRes.json() as RazorpaySubscriptionResponse; }
  catch { return jsonResponse({ ok: false, reason: "razorpay_bad_response" }, 502); }

  const newSubscriptionId = subJson.id;
  const trialEndsAt = startAt ? new Date(startAt * 1000).toISOString() : new Date().toISOString();

  // ------------------------------------------------------------------
  // 8. Record attempt + attach to tenant_subscriptions (stays trial).
  // ------------------------------------------------------------------
  await svc.from("payment_attempts").insert({
    tenant_id: tenantId, plan_id: plan.id, billing_cycle,
    razorpay_subscription_id: newSubscriptionId, status: "initiated",
    amount_inr: billing_cycle === "monthly" ? plan.monthly_price_inr : plan.yearly_price_inr,
  });

  await svc.from("tenant_subscriptions").update({
    plan_id: plan.id,
    billing_cycle,
    status: "trial",
    razorpay_subscription_id: newSubscriptionId,
    trial_started_at: new Date().toISOString(),
    trial_ends_at: trialEndsAt,
    current_period_end: trialEndsAt,
    updated_at: new Date().toISOString(),
  }).eq("tenant_id", tenantId);

  await svc.from("profiles").update({
    subscription_id: newSubscriptionId, updated_at: new Date().toISOString(),
  }).eq("id", userId);

  await svc.from("subscription_history").insert({
    tenant_id: tenantId, from_status: "trial", to_status: "trial",
    reason: `Razorpay subscription created (trial ${trialDays}d, charge on ${trialEndsAt.slice(0, 10)})`,
    actor: "user",
    metadata_json: { razorpay_subscription_id: newSubscriptionId, plan_code, billing_cycle },
  });

  // ------------------------------------------------------------------
  // 9. Return everything the client Checkout needs.
  // ------------------------------------------------------------------
  return jsonResponse({
    ok: true,
    subscription_id: newSubscriptionId,
    key_id: razorpayKeyId,      // public key — safe to expose for Checkout.js
    short_url: subJson.short_url ?? null,
    status: subJson.status,
    trial_ends_at: trialEndsAt,
  });
});
