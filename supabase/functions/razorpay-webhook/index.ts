// supabase/functions/razorpay-webhook/index.ts
// Called by:
//   Razorpay platform — registered webhook URL for payment_link.* and
//   subscription.* events.
//
// Auth: HMAC-SHA256 signature in X-Razorpay-Signature header.
//   - When RAZORPAY_WEBHOOK_SECRET is set: verify the body signature; reject
//     with 401 on mismatch.
//   - When not configured: accept but log a warning, so the function can be
//     deployed before Razorpay is fully live.
//
// Logic:
//   - payment_link.paid → look up financial_transactions.id via
//     payload.payment_link.entity.notes.transaction_id and UPDATE its
//     payment_status to 'paid'. The DB trigger update_buyer_balance() then
//     recomputes the buyer's outstanding balance automatically.
//   - subscription.activated / .charged / .completed / .cancelled /
//     .halted / .pending / .paused / .resumed → UPDATE
//     profiles.subscription_status by matching subscription_id.
//   - Any other event → return 200 to prevent retry loops; no DB write.
//
// Always return 200 for well-formed requests; 401 only on signature mismatch.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-razorpay-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface PaymentLinkNotes {
  transaction_id?: string;
  farm_id?: string;
  buyer_id?: string;
}

interface PaymentLinkEntity {
  id?: string;
  status?: string;
  notes?: PaymentLinkNotes;
}

interface PaymentLinkPayload {
  payment_link?: { entity?: PaymentLinkEntity };
}

interface SubscriptionEntity {
  id?: string;
  status?: string;
}

interface SubscriptionPayload {
  subscription?: { entity?: SubscriptionEntity };
}

interface RazorpayWebhookEvent {
  event?: string;
  payload?: PaymentLinkPayload | SubscriptionPayload;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // 1. Read raw body for signature verification.
  const rawBody = await req.text();

  // 2. Verify signature when secret is configured.
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  const signatureHeader = req.headers.get("X-Razorpay-Signature");

  if (webhookSecret) {
    if (!signatureHeader) {
      return jsonResponse({ error: "Missing signature header" }, 401);
    }
    const expectedSig = createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");
    if (!constantTimeEquals(expectedSig, signatureHeader)) {
      console.warn("Razorpay webhook signature mismatch — rejecting request");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  } else {
    console.warn(
      "RAZORPAY_WEBHOOK_SECRET not configured — accepting webhook without signature verification",
    );
  }

  // 3. Parse the body.
  let event: RazorpayWebhookEvent;
  try {
    event = JSON.parse(rawBody) as RazorpayWebhookEvent;
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  // 4. Single service-role client shared across all branches (no user context
  //    in a webhook — must bypass RLS for all writes).
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 5. Dispatch on event type.
  const eventName = event.event ?? "";

  // --- payment_link.paid ---------------------------------------------------
  if (eventName === "payment_link.paid") {
    const plPayload = event.payload as PaymentLinkPayload | undefined;
    const entity = plPayload?.payment_link?.entity;
    const txnId = entity?.notes?.transaction_id;
    if (!txnId) {
      console.warn(
        "payment_link.paid event missing notes.transaction_id; ignoring",
        { payment_link_id: entity?.id },
      );
      return jsonResponse({ ok: true, reason: "missing_transaction_id" });
    }

    const { data, error } = await supabase
      .from("financial_transactions")
      .update({ payment_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", txnId)
      .select("id, farm_id, buyer_id, amount, payment_status")
      .maybeSingle();

    if (error) {
      console.error("Failed to mark transaction paid:", error.message);
      // Return 200 anyway so Razorpay doesn't hammer us with retries on a
      // schema or RLS issue — we'll see the error in logs.
      return jsonResponse({ ok: true, db_error: error.message });
    }
    if (!data) {
      console.warn("No transaction found for id", txnId);
      return jsonResponse({ ok: true, reason: "transaction_not_found" });
    }

    return jsonResponse({
      ok: true,
      transaction_id: data.id,
      payment_status: data.payment_status,
    });
  }

  // --- subscription lifecycle events ---------------------------------------
  //
  // Mapping:
  //   subscription.activated  → active
  //   subscription.charged    → active
  //   subscription.resumed    → active
  //   subscription.completed  → cancelled
  //   subscription.cancelled  → cancelled
  //   subscription.halted     → past_due
  //   subscription.pending    → past_due
  //   subscription.paused     → past_due

  const SUBSCRIPTION_STATUS_MAP: Record<
    string,
    "active" | "cancelled" | "past_due"
  > = {
    "subscription.activated": "active",
    "subscription.charged": "active",
    "subscription.resumed": "active",
    "subscription.completed": "cancelled",
    "subscription.cancelled": "cancelled",
    "subscription.halted": "past_due",
    "subscription.pending": "past_due",
    "subscription.paused": "past_due",
  };

  if (Object.prototype.hasOwnProperty.call(SUBSCRIPTION_STATUS_MAP, eventName)) {
    const newStatus = SUBSCRIPTION_STATUS_MAP[eventName];
    const subPayload = event.payload as SubscriptionPayload | undefined;
    const subscriptionId = subPayload?.subscription?.entity?.id;

    if (!subscriptionId) {
      console.warn(
        `${eventName} event missing payload.subscription.entity.id; ignoring`,
      );
      return jsonResponse({ ok: true, reason: "missing_subscription_id" });
    }

    // 1) Tenant subscription — the source of truth for `is_tenant_paid` gating.
    //    Match on razorpay_subscription_id (set by create-razorpay-subscription).
    //    On an activating event, extend the billing period so the tenant stays
    //    paid until the next charge; cancellation/past_due leave the period as-is.
    const { data: subRow } = await supabase
      .from("tenant_subscriptions")
      .select("id, tenant_id, billing_cycle")
      .eq("razorpay_subscription_id", subscriptionId)
      .maybeSingle();

    if (subRow) {
      const tenantUpdate: Record<string, unknown> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      };
      if (newStatus === "active") {
        const now = new Date();
        const periodEnd = new Date(now);
        if (subRow.billing_cycle === "yearly") {
          periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        } else {
          periodEnd.setMonth(periodEnd.getMonth() + 1);
        }
        tenantUpdate.current_period_end = periodEnd.toISOString();
      }
      if (newStatus === "cancelled") {
        tenantUpdate.cancelled_at = new Date().toISOString();
      }
      const { error: tenantErr } = await supabase
        .from("tenant_subscriptions")
        .update(tenantUpdate)
        .eq("id", subRow.id);
      if (tenantErr) {
        console.error(
          `Failed to update tenant_subscriptions for ${subscriptionId}:`,
          tenantErr.message,
        );
      }
    } else {
      console.warn(
        `No tenant_subscriptions matched razorpay_subscription_id ${subscriptionId}`,
      );
    }

    // 2) Legacy profile mirror — kept for back-compat with any per-user reads.
    const { data, error } = await supabase
      .from("profiles")
      .update({
        subscription_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("subscription_id", subscriptionId)
      .select("id, subscription_status")
      .maybeSingle();

    if (error) {
      console.error(
        `Failed to update subscription_status for ${subscriptionId}:`,
        error.message,
      );
      // Return 200 to suppress Razorpay retries; investigate via logs.
      return jsonResponse({ ok: true, db_error: error.message, tenant_synced: !!subRow });
    }

    return jsonResponse({
      ok: true,
      tenant_synced: !!subRow,
      profile_id: data?.id ?? null,
      subscription_status: newStatus,
    });
  }

  // --- fall-through: acknowledge unknown events without DB write -----------
  return jsonResponse({ ok: true, ignored: event.event ?? null });
});
