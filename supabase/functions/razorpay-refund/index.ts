// supabase/functions/razorpay-refund/index.ts
//
// Control Center operator action: refund a captured payment (full or partial).
// Requires the caller to hold the platform permission `billing:manage`
// (checked via platform_has_permission with the operator's JWT). Issues the
// Razorpay refund, updates the payments + invoice rows, and writes a platform
// audit entry.
//
// Auth: operator JWT (platform_admin with billing:manage).
// Body: { payment_id, amount_inr?, reason? }   amount omitted = full refund.
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

  // Authorize: operator must hold billing:manage.
  const { data: allowed } = await userClient.rpc("platform_has_permission", { p_perm: "billing:manage" });
  if (!allowed) return json({ error: "Forbidden", reason: "billing:manage required" }, 403);

  let body: { payment_id?: string; amount_inr?: number; reason?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.payment_id) return json({ error: "payment_id required" }, 400);

  const { data: pay } = await svc.from("payments").select("*").eq("id", body.payment_id).maybeSingle();
  if (!pay) return json({ error: "Payment not found" }, 404);
  if (!pay.razorpay_payment_id) return json({ error: "Payment has no Razorpay reference" }, 400);
  if (pay.status === "refunded") return json({ error: "Already fully refunded" }, 409);

  const keyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  if (!keyId || !keySecret) return json({ ok: false, reason: "not_configured" });

  const refundAmount = body.amount_inr && body.amount_inr > 0 ? body.amount_inr : Number(pay.amount_inr);
  const refundPaise = Math.round(refundAmount * 100);

  let rzRefund: { id?: string } = {};
  try {
    const res = await fetch(`https://api.razorpay.com/v1/payments/${pay.razorpay_payment_id}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Basic " + btoa(`${keyId}:${keySecret}`) },
      body: JSON.stringify({ amount: refundPaise, notes: { reason: body.reason ?? "operator refund", operator: user.id } }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => res.status);
      return json({ ok: false, reason: "razorpay_error", details: t }, 502);
    }
    rzRefund = await res.json();
  } catch (e) {
    return json({ ok: false, reason: "network_error", details: String(e) }, 502);
  }

  const newRefunded = Number(pay.refunded_amount_inr ?? 0) + refundAmount;
  const fullyRefunded = newRefunded >= Number(pay.amount_inr);
  await svc.from("payments").update({
    status: fullyRefunded ? "refunded" : "partially_refunded",
    refunded_amount_inr: newRefunded, updated_at: new Date().toISOString(),
  }).eq("id", pay.id);

  if (pay.invoice_id && fullyRefunded) {
    await svc.from("invoices").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", pay.invoice_id);
  }

  // Audit as the operator (their JWT → log_platform_event records actor).
  await userClient.rpc("log_platform_event", {
    p_action: "payment.refund", p_permission: "billing:manage", p_target_type: "payment",
    p_target_id: pay.id, p_target_tenant: pay.tenant_id, p_after: { refund_inr: refundAmount, fully_refunded: fullyRefunded },
    p_reason: body.reason ?? null,
  });

  return json({ ok: true, refund_id: rzRefund.id ?? null, refunded_amount_inr: newRefunded, fully_refunded: fullyRefunded });
});
