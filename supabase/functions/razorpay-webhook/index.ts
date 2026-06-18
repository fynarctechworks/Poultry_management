// supabase/functions/razorpay-webhook/index.ts
//
// Razorpay platform webhook. Handles BOTH:
//   * Buyer UPI Khata payment links  (payment_link.paid)
//   * SaaS subscription billing       (subscription.* / payment.failed)
//
// Auth: HMAC-SHA256 of the raw body in X-Razorpay-Signature.
//   - RAZORPAY_WEBHOOK_SECRET set            → verify, reject 401 on mismatch.
//   - not set + ALLOW_UNSIGNED_WEBHOOKS=true → accept + warn (DEV ONLY).
//   - not set (default / production)         → fail CLOSED, reject 401 (SEC-6).
//
// Idempotency: Razorpay redelivers. We record x-razorpay-event-id in
//   razorpay_webhook_events and process each event exactly once.
//
// Money flow (subscription.charged → the first real charge after the 7-day
//   trial, and every renewal thereafter):
//     1. dedup by razorpay_payment_id
//     2. issue an invoice (paid) + invoice_items + a payments row
//     3. flip the tenant subscription to 'active' (set_subscription_status →
//        writes subscription_history + mirrors tenants.status + stamps
//        trial_converted_at), and roll current_period_end forward
//     4. fire-and-forget generate-invoice-pdf
//
// Always 200 for well-formed requests (so Razorpay stops retrying); 401 only on
// signature mismatch.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createHmac } from "node:crypto";
import { dispatchEmail, resolveTenantOwnerEmail } from "../_shared/send-email-client.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-razorpay-event-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// deno-lint-ignore no-explicit-any
type AnyObj = Record<string, any>;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const rawBody = await req.text();

  // 1. Verify signature.
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "";
  const signatureHeader = req.headers.get("X-Razorpay-Signature");
  if (webhookSecret) {
    if (!signatureHeader) return jsonResponse({ error: "Missing signature header" }, 401);
    const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    if (!constantTimeEquals(expected, signatureHeader)) {
      console.warn("Razorpay webhook signature mismatch — rejecting");
      return jsonResponse({ error: "Invalid signature" }, 401);
    }
  } else if (Deno.env.get("ALLOW_UNSIGNED_WEBHOOKS") === "true") {
    console.warn("ALLOW_UNSIGNED_WEBHOOKS=true — accepting Razorpay webhook WITHOUT verification (DEV ONLY)");
  } else {
    // SEC-6: fail CLOSED. Without a configured secret, a forged subscription.charged
    // would activate a tenant for free (subscription bypass), and a forged
    // payment_link.paid would mark arbitrary invoices paid. Refuse rather than trust.
    console.error("RAZORPAY_WEBHOOK_SECRET not configured — refusing unsigned webhook");
    return jsonResponse({ error: "Webhook verification not configured" }, 401);
  }

  let event: AnyObj;
  try { event = JSON.parse(rawBody); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const eventName: string = event.event ?? "";

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  // 2. Idempotency: record the event id; skip if already processed.
  const eventId = req.headers.get("X-Razorpay-Event-Id") ?? `${eventName}:${event.created_at ?? ""}`;
  const { data: existing } = await supabase
    .from("razorpay_webhook_events").select("id, status").eq("razorpay_event_id", eventId).maybeSingle();
  if (existing && existing.status === "processed") {
    return jsonResponse({ ok: true, deduped: true });
  }
  if (!existing) {
    await supabase.from("razorpay_webhook_events").insert({
      razorpay_event_id: eventId, event_type: eventName, payload_json: event, status: "received",
    });
  }
  const markProcessed = (status: "processed" | "failed" | "ignored", err?: string) =>
    supabase.from("razorpay_webhook_events").update({ status, error: err ?? null, processed_at: new Date().toISOString() })
      .eq("razorpay_event_id", eventId);

  // ---- payment_link.paid (buyer UPI Khata) --------------------------------
  if (eventName === "payment_link.paid") {
    const txnId = event.payload?.payment_link?.entity?.notes?.transaction_id;
    if (!txnId) { await markProcessed("ignored"); return jsonResponse({ ok: true, reason: "missing_transaction_id" }); }
    const { data, error } = await supabase
      .from("financial_transactions")
      .update({ payment_status: "paid", updated_at: new Date().toISOString() })
      .eq("id", txnId).select("id, payment_status").maybeSingle();
    await markProcessed(error ? "failed" : "processed", error?.message);
    if (error) return jsonResponse({ ok: true, db_error: error.message });
    if (!data) return jsonResponse({ ok: true, reason: "transaction_not_found" });
    return jsonResponse({ ok: true, transaction_id: data.id, payment_status: data.payment_status });
  }

  // ---- subscription.charged → invoice + payment + activate ----------------
  if (eventName === "subscription.charged") {
    try {
      const sub = event.payload?.subscription?.entity as AnyObj | undefined;
      const pay = event.payload?.payment?.entity as AnyObj | undefined;
      const subscriptionId = sub?.id;
      if (!subscriptionId || !pay?.id) { await markProcessed("ignored"); return jsonResponse({ ok: true, reason: "missing_ids" }); }

      const { data: ts } = await supabase
        .from("tenant_subscriptions")
        .select("id, tenant_id, plan_id, billing_cycle")
        .eq("razorpay_subscription_id", subscriptionId).maybeSingle();
      if (!ts) { await markProcessed("ignored"); return jsonResponse({ ok: true, reason: "no_tenant_subscription" }); }

      // Dedup: this payment already recorded?
      const { data: existingPay } = await supabase
        .from("payments").select("id").eq("razorpay_payment_id", pay.id).maybeSingle();
      if (existingPay) { await markProcessed("processed"); return jsonResponse({ ok: true, deduped_payment: true }); }

      const { data: plan } = await supabase
        .from("subscription_plans").select("name, code").eq("id", ts.plan_id).maybeSingle();
      const { data: billing } = await supabase
        .from("billing_profiles").select("*").eq("tenant_id", ts.tenant_id).maybeSingle();

      const totalInr = Math.round(((pay.amount ?? 0) / 100) * 100) / 100;        // paise → INR
      const subtotalInr = Math.round((totalInr / 1.18) * 100) / 100;             // GST-inclusive
      const taxInr = Math.round((totalInr - subtotalInr) * 100) / 100;
      const periodStart = sub?.current_start ? new Date(sub.current_start * 1000).toISOString() : new Date().toISOString();
      const periodEnd = sub?.current_end ? new Date(sub.current_end * 1000).toISOString()
        : (() => { const d = new Date(); ts.billing_cycle === "yearly" ? d.setFullYear(d.getFullYear() + 1) : d.setMonth(d.getMonth() + 1); return d.toISOString(); })();

      const { data: invNo } = await supabase.rpc("next_invoice_number");

      const { data: invoice, error: invErr } = await supabase.from("invoices").insert({
        tenant_id: ts.tenant_id, subscription_id: ts.id, plan_id: ts.plan_id,
        invoice_number: invNo, status: "paid", billing_cycle: ts.billing_cycle,
        subtotal_inr: subtotalInr, discount_inr: 0, tax_rate_pct: 18, tax_inr: taxInr, total_inr: totalInr,
        period_start: periodStart, period_end: periodEnd, paid_at: new Date().toISOString(),
        razorpay_payment_id: pay.id, razorpay_subscription_id: subscriptionId, razorpay_invoice_id: event.payload?.invoice?.entity?.id ?? null,
        billing_snapshot_json: billing ?? null,
      }).select("id").single();
      if (invErr) throw invErr;

      await supabase.from("invoice_items").insert({
        invoice_id: invoice.id,
        description: `${plan?.name ?? "PoultryOS"} subscription (${ts.billing_cycle}) — ${periodStart.slice(0, 10)} to ${periodEnd.slice(0, 10)}`,
        quantity: 1, unit_price_inr: subtotalInr, amount_inr: subtotalInr, sort_order: 0,
      });

      await supabase.from("payments").insert({
        tenant_id: ts.tenant_id, invoice_id: invoice.id,
        razorpay_payment_id: pay.id, razorpay_order_id: pay.order_id ?? null, razorpay_subscription_id: subscriptionId,
        amount_inr: totalInr, method: pay.method ?? null, status: "captured", captured_at: new Date().toISOString(),
        fee_inr: pay.fee != null ? pay.fee / 100 : null, tax_inr: pay.tax != null ? pay.tax / 100 : null,
        raw_json: pay,
      });

      // Mark any open attempt for this subscription successful.
      await supabase.from("payment_attempts")
        .update({ status: "success", updated_at: new Date().toISOString() })
        .eq("razorpay_subscription_id", subscriptionId).eq("status", "initiated");

      // Flip to active (history + tenants.status + trial_converted_at) and roll the period.
      await supabase.rpc("set_subscription_status", {
        p_tenant_id: ts.tenant_id, p_status: "active",
        p_reason: `Charged ₹${totalInr} (${invNo})`, p_actor: "webhook",
      });
      await supabase.from("tenant_subscriptions")
        .update({ current_period_end: periodEnd, updated_at: new Date().toISOString() })
        .eq("id", ts.id);

      // Fire-and-forget PDF render.
      fetch(`${supabaseUrl}/functions/v1/generate-invoice-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}` },
        body: JSON.stringify({ invoice_id: invoice.id }),
      }).catch((e) => console.warn("invoice pdf trigger failed:", e));

      // Payment-success email (best-effort — never blocks webhook ack).
      const successEmail = await resolveTenantOwnerEmail(ts.tenant_id);
      if (successEmail) {
        await dispatchEmail({
          recipient_email: successEmail,
          email_type: "payment_success",
          template_id: "payment_success",
          tenant_id: ts.tenant_id,
          template_data: {
            amount: `₹${Number(totalInr).toLocaleString("en-IN")}`,
            planName: plan?.name ?? undefined,
            invoiceId: invNo,
            paidOn: new Date().toISOString().slice(0, 10),
          },
        });
      }

      await markProcessed("processed");
      return jsonResponse({ ok: true, invoice_number: invNo, invoice_id: invoice.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("subscription.charged handler error:", msg);
      await markProcessed("failed", msg);
      return jsonResponse({ ok: true, error: msg });   // 200 to stop retries; logged
    }
  }

  // ---- payment.failed (mandate / auto-debit failure) ----------------------
  if (eventName === "payment.failed") {
    const pay = event.payload?.payment?.entity as AnyObj | undefined;
    const subscriptionId = pay?.subscription_id ?? pay?.notes?.subscription_id;
    if (subscriptionId) {
      const { data: ts } = await supabase.from("tenant_subscriptions")
        .select("id, tenant_id").eq("razorpay_subscription_id", subscriptionId).maybeSingle();
      if (ts) {
        await supabase.from("payment_attempts").insert({
          tenant_id: ts.tenant_id, razorpay_subscription_id: subscriptionId, status: "failed",
          failure_reason: pay?.error_description ?? pay?.error_reason ?? "payment failed",
        });

        // Payment-failed email (best-effort).
        const failEmail = await resolveTenantOwnerEmail(ts.tenant_id);
        if (failEmail) {
          await dispatchEmail({
            recipient_email: failEmail,
            email_type: "payment_failed",
            template_id: "payment_failed",
            tenant_id: ts.tenant_id,
            template_data: {
              amount: pay?.amount ? `₹${(Number(pay.amount) / 100).toLocaleString("en-IN")}` : undefined,
            },
          });
        }
      }
    }
    await markProcessed("processed");
    return jsonResponse({ ok: true, recorded: "payment_failed" });
  }

  // ---- other subscription lifecycle events --------------------------------
  const STATUS_MAP: Record<string, "active" | "cancelled" | "past_due"> = {
    "subscription.activated": "active",
    "subscription.resumed": "active",
    "subscription.completed": "cancelled",
    "subscription.cancelled": "cancelled",
    "subscription.halted": "past_due",
    "subscription.pending": "past_due",
    "subscription.paused": "past_due",
  };
  if (Object.prototype.hasOwnProperty.call(STATUS_MAP, eventName)) {
    const newStatus = STATUS_MAP[eventName];
    const subscriptionId = event.payload?.subscription?.entity?.id;
    if (!subscriptionId) { await markProcessed("ignored"); return jsonResponse({ ok: true, reason: "missing_subscription_id" }); }

    const { data: ts } = await supabase.from("tenant_subscriptions")
      .select("id, tenant_id").eq("razorpay_subscription_id", subscriptionId).maybeSingle();
    if (ts) {
      await supabase.rpc("set_subscription_status", {
        p_tenant_id: ts.tenant_id, p_status: newStatus, p_reason: `Razorpay ${eventName}`, p_actor: "webhook",
      });
    } else {
      console.warn(`No tenant_subscriptions for razorpay_subscription_id ${subscriptionId}`);
    }
    // Legacy profile mirror (back-compat).
    await supabase.from("profiles")
      .update({ subscription_status: newStatus, updated_at: new Date().toISOString() })
      .eq("subscription_id", subscriptionId);
    await markProcessed("processed");
    return jsonResponse({ ok: true, tenant_synced: !!ts, subscription_status: newStatus });
  }

  await markProcessed("ignored");
  return jsonResponse({ ok: true, ignored: eventName || null });
});
