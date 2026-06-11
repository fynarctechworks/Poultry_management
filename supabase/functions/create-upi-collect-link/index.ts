// supabase/functions/create-upi-collect-link/index.ts
// Generates a Razorpay UPI Collect payment link for a financial_transaction.
//
// Called by: authenticated app users from BuyerDetail or transaction detail.
// Auth: caller's user JWT — RLS on financial_transactions enforces ownership.
//
// Logic:
//   1. Verify user JWT, look up the transaction with the caller's RLS.
//   2. Require transaction is income, pending/partial, has buyer with phone.
//   3. Razorpay Payment Links API: type=upi, accept_partial=false, with
//      notes.transaction_id so the (future) razorpay-webhook can mark paid.
//   4. Return { short_url, payment_link_id } or { ok:false, reason } when
//      Razorpay isn't configured / API errors out.
//
// Graceful degrade: if RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET is missing,
// returns 200 with { ok:false, reason:"not_configured" } so the client UI
// can fall back to the offline UPI QR.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

interface RequestBody {
  transaction_id?: string;
}

interface RazorpayLinkResponse {
  id: string;
  short_url: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  if (!body.transaction_id) {
    return jsonResponse({ error: "transaction_id is required" }, 400);
  }

  // 1. Fetch transaction under caller's RLS — if they can't see it, they
  //    cannot create a payment link for it.
  const { data: txn, error: txnErr } = await userClient
    .from("financial_transactions")
    .select(
      "id, farm_id, buyer_id, transaction_type, amount, payment_status, notes",
    )
    .eq("id", body.transaction_id)
    .maybeSingle();

  if (txnErr || !txn) {
    return jsonResponse(
      { error: "Transaction not found or not accessible" },
      404,
    );
  }
  if (txn.transaction_type !== "income") {
    return jsonResponse(
      { error: "Only income transactions can have collect links" },
      400,
    );
  }
  if (txn.payment_status === "paid") {
    return jsonResponse({ error: "Transaction is already paid" }, 400);
  }

  // 2. Pull buyer + farm for the customer block.
  const [buyerRes, farmRes] = await Promise.all([
    txn.buyer_id
      ? userClient
          .from("buyers")
          .select("buyer_name, phone, whatsapp_phone")
          .eq("id", txn.buyer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    userClient
      .from("farms")
      .select("farm_name, upi_id")
      .eq("id", txn.farm_id)
      .maybeSingle(),
  ]);

  const buyer = buyerRes.data ?? null;
  const farm = farmRes.data ?? null;

  if (!buyer || !farm) {
    return jsonResponse(
      { error: "Transaction must have a linked buyer and farm" },
      400,
    );
  }

  const recipientPhone =
    buyer.whatsapp_phone?.trim() || buyer.phone?.trim() || "";
  if (!recipientPhone) {
    return jsonResponse(
      { error: "Buyer must have a phone number for UPI Collect" },
      400,
    );
  }

  // 3. Guard: Razorpay credentials configured?
  const razorpayKeyId = Deno.env.get("RAZORPAY_KEY_ID") ?? "";
  const razorpayKeySecret = Deno.env.get("RAZORPAY_KEY_SECRET") ?? "";
  if (!razorpayKeyId || !razorpayKeySecret) {
    console.warn("RAZORPAY_KEY_ID/SECRET not configured");
    return jsonResponse({ ok: false, reason: "not_configured" });
  }

  // 4. Call Razorpay Payment Links API
  // Docs: https://razorpay.com/docs/api/payments/payment-links/standard/
  // For UPI Collect specifically, set upi_link=true (deprecated alias for
  // type=upi). We use the type=upi field per current API spec.
  const amountPaise = Math.round(Number(txn.amount) * 100);
  const auth =
    "Basic " + btoa(`${razorpayKeyId}:${razorpayKeySecret}`);

  const phoneDigits = recipientPhone.replace(/\D/g, "");
  // Razorpay expects 10-digit Indian mobile or E.164. Pass leading +91 if 10 digits.
  const customerContact =
    phoneDigits.length === 10 ? `+91${phoneDigits}` : `+${phoneDigits}`;

  const payload = {
    amount: amountPaise,
    currency: "INR",
    accept_partial: false,
    description: `Payment to ${farm.farm_name}`,
    customer: {
      name: buyer.buyer_name,
      contact: customerContact,
    },
    notify: { sms: true, email: false },
    reminder_enable: false,
    notes: {
      transaction_id: txn.id,
      farm_id: txn.farm_id,
      buyer_id: txn.buyer_id ?? "",
    },
    upi_link: true,
    options: {
      checkout: { method: { upi: true, card: false, netbanking: false, wallet: false } },
    },
  };

  let linkRes: Response;
  try {
    linkRes = await fetch("https://api.razorpay.com/v1/payment_links", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: auth,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("Razorpay network error:", err);
    return jsonResponse({ ok: false, reason: "network_error" }, 502);
  }

  if (!linkRes.ok) {
    const errText = await linkRes.text().catch(() => `HTTP ${linkRes.status}`);
    console.warn(`Razorpay error ${linkRes.status}: ${errText}`);
    return jsonResponse(
      { ok: false, reason: "razorpay_error", status: linkRes.status, details: errText },
      502,
    );
  }

  let linkJson: RazorpayLinkResponse;
  try {
    linkJson = (await linkRes.json()) as RazorpayLinkResponse;
  } catch {
    return jsonResponse({ ok: false, reason: "razorpay_bad_response" }, 502);
  }

  return jsonResponse({
    ok: true,
    payment_link_id: linkJson.id,
    short_url: linkJson.short_url,
  });
});
