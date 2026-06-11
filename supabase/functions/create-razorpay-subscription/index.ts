// supabase/functions/create-razorpay-subscription/index.ts
//
// Creates a Razorpay subscription for a PoultryOS user upgrading from free tier.
//
// Called by: authenticated app users from the subscription/upgrade screen.
// Auth: caller's user JWT — userClient carries RLS so profile/plan lookups are
//       scoped to the calling user. A second service-role client is used only
//       for the final UPDATE profiles SET subscription_id = ... because
//       RLS on profiles may not permit self-write of that column.
//
// Flow:
//   1. Validate Authorization: Bearer <jwt> header. 401 otherwise.
//   2. Parse + Zod-validate body: { plan_code, billing_cycle }.
//   3. Resolve user via userClient.auth.getUser(). 401 if missing.
//   4. SELECT subscription_plans WHERE code = plan_code AND is_active. 404 if missing.
//   5. Pick razorpay_plan_id based on billing_cycle. Graceful 200 if null.
//   6. Guard: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing → 200 { ok:false, reason:"not_configured" }.
//   7. Fetch profile (full_name, phone, whatsapp_phone) for Razorpay customer notify.
//   8. POST https://api.razorpay.com/v1/subscriptions with Basic auth.
//   9. On Razorpay success: service-role UPDATE profiles SET subscription_id, updated_at.
//  10. Return { ok:true, subscription_id, short_url, status }.
//
// Environment variables consumed:
//   SUPABASE_URL              — Supabase project REST endpoint
//   SUPABASE_ANON_KEY         — Public anon key (used for user-scoped client)
//   SUPABASE_SERVICE_ROLE_KEY — Service role key (used only for profile write-back)
//   RAZORPAY_KEY_ID           — Razorpay API key id (test or live)
//   RAZORPAY_KEY_SECRET       — Razorpay API key secret
//
// total_count rationale (MVP cap to avoid runaway billing):
//   monthly → 12  (auto-cancels after 12 charges ≈ 1 year)
//   yearly  →  1  (charges once, ends; renewal handled via webhook + new subscription)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// CORS — copied verbatim from create-upi-collect-link (Edge Functions are isolated)
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
// Input schema
// ---------------------------------------------------------------------------
const BodySchema = z.object({
  plan_code: z.string().min(1),
  billing_cycle: z.enum(["monthly", "yearly"]),
});

// ---------------------------------------------------------------------------
// Razorpay response shape (minimal — only the fields we use)
// ---------------------------------------------------------------------------
interface RazorpaySubscriptionResponse {
  id: string;
  short_url?: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ------------------------------------------------------------------
  // 1. Auth header — must be Bearer <jwt>
  // ------------------------------------------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // User-scoped client — RLS applies via forwarded JWT
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  // ------------------------------------------------------------------
  // 2. Parse + validate body
  // ------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.flatten() }, 400);
  }
  const { plan_code, billing_cycle } = parsed.data;

  // ------------------------------------------------------------------
  // 3. Resolve caller identity
  // ------------------------------------------------------------------
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }
  const userId = user.id;

  // ------------------------------------------------------------------
  // 4. Look up subscription plan
  // ------------------------------------------------------------------
  const { data: plan, error: planErr } = await userClient
    .from("subscription_plans")
    .select(
      "id, code, name, razorpay_plan_id_monthly, razorpay_plan_id_yearly",
    )
    .eq("code", plan_code)
    .eq("is_active", true)
    .maybeSingle();

  if (planErr || !plan) {
    return jsonResponse({ error: "Plan not found" }, 404);
  }

  // ------------------------------------------------------------------
  // 5. Pick the correct Razorpay plan id for the requested billing cycle
  // ------------------------------------------------------------------
  const razorpayPlanId: string | null =
    billing_cycle === "monthly"
      ? (plan.razorpay_plan_id_monthly ?? null)
      : (plan.razorpay_plan_id_yearly ?? null);

  if (!razorpayPlanId) {
    return jsonResponse({
      ok: false,
      reason: "plan_not_configured",
      details:
        "Razorpay plan id is not yet configured for this billing cycle",
    });
  }

  // ------------------------------------------------------------------
  // 6. Guard: Razorpay credentials present?
  // ------------------------------------------------------------------
  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  if (!razorpayKeyId || !razorpayKeySecret) {
    console.warn("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured");
    return jsonResponse({ ok: false, reason: "not_configured" });
  }

  // ------------------------------------------------------------------
  // 7. Fetch profile for Razorpay customer notify channels
  //    RLS allows a user to SELECT their own profile row.
  // ------------------------------------------------------------------
  const { data: profile } = await userClient
    .from("profiles")
    .select("full_name, phone, whatsapp_phone")
    .eq("id", userId)
    .maybeSingle();

  // profile lookup is best-effort — Razorpay customer_notify works without it
  const customerName = profile?.full_name ?? "";
  const customerContact =
    (profile?.whatsapp_phone ?? profile?.phone ?? "").trim();

  // ------------------------------------------------------------------
  // 8. POST to Razorpay Subscriptions API
  //    Docs: https://razorpay.com/docs/api/payments/subscriptions/create/
  //    total_count cap: monthly=12, yearly=1 (see top-of-file rationale)
  // ------------------------------------------------------------------
  const totalCount = billing_cycle === "monthly" ? 12 : 1;
  const basicAuth = "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

  const subscriptionPayload: Record<string, unknown> = {
    plan_id: razorpayPlanId,
    total_count: totalCount,
    quantity: 1,
    customer_notify: 1,
    notes: {
      user_id: userId,
      plan_code: plan_code,
      billing_cycle: billing_cycle,
    },
  };

  // Attach customer contact to notify block only if we have a phone
  if (customerContact) {
    // Normalise to E.164: if 10 digits assume +91
    const digits = customerContact.replace(/\D/g, "");
    const e164 =
      digits.length === 10 ? `+91${digits}` : `+${digits}`;
    subscriptionPayload.notify_info = {
      notify_phone: e164,
      notify_email: "",
    };
  }

  let razorpayRes: Response;
  try {
    razorpayRes = await fetch(
      "https://api.razorpay.com/v1/subscriptions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: basicAuth,
        },
        body: JSON.stringify(subscriptionPayload),
      },
    );
  } catch (err) {
    console.error("Razorpay network error:", err);
    return jsonResponse({ ok: false, reason: "network_error" }, 502);
  }

  if (!razorpayRes.ok) {
    const errText = await razorpayRes
      .text()
      .catch(() => `HTTP ${razorpayRes.status}`);
    console.warn(`Razorpay error ${razorpayRes.status}: ${errText}`);
    return jsonResponse(
      {
        ok: false,
        reason: "razorpay_error",
        status: razorpayRes.status,
        details: errText,
      },
      502,
    );
  }

  let subJson: RazorpaySubscriptionResponse;
  try {
    subJson = (await razorpayRes.json()) as RazorpaySubscriptionResponse;
  } catch {
    return jsonResponse({ ok: false, reason: "razorpay_bad_response" }, 502);
  }

  const newSubscriptionId = subJson.id;

  // ------------------------------------------------------------------
  // 9. Persist the chosen plan on the tenant subscription + the
  //    subscription_id on profiles, using a service-role client (user RLS
  //    may not allow self-write of these). The subscription stays in its
  //    current status (trial) until the razorpay-webhook flips it to
  //    'active' on the first successful charge — `is_tenant_paid` is the
  //    single source of truth for gating, so we never grant access here.
  // ------------------------------------------------------------------
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey) {
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { error: updateErr } = await serviceClient
      .from("profiles")
      .update({
        subscription_id: newSubscriptionId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (updateErr) {
      console.error(
        `Failed to write subscription_id to profiles for user ${userId}:`,
        updateErr.message,
      );
    }

    // Resolve the caller's tenant and record the pending plan switch so the
    // webhook can match the subscription back to the right tenant_subscriptions
    // row by razorpay_subscription_id.
    const { data: profileTenant } = await serviceClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    const tenantId = profileTenant?.tenant_id ?? null;

    if (tenantId) {
      const { error: subErr } = await serviceClient
        .from("tenant_subscriptions")
        .update({
          plan_id: plan.id,
          billing_cycle,
          razorpay_subscription_id: newSubscriptionId,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tenantId);
      if (subErr) {
        console.error(
          `Failed to attach subscription to tenant ${tenantId}:`,
          subErr.message,
        );
      }
    } else {
      console.warn(
        `No tenant_id on profile ${userId} — tenant_subscriptions not updated`,
      );
    }
  } else {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY missing — subscription not persisted",
    );
  }

  // ------------------------------------------------------------------
  // 10. Return success
  // ------------------------------------------------------------------
  return jsonResponse({
    ok: true,
    subscription_id: newSubscriptionId,
    short_url: subJson.short_url ?? null,
    status: subJson.status,
  });
});
