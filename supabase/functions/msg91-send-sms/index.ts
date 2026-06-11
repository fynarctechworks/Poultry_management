// supabase/functions/msg91-send-sms/index.ts
//
// Supabase Auth "Send SMS" hook. Supabase generates the OTP and calls this hook
// to actually deliver the SMS; we route delivery through MSG91 (the mandated
// India SMS provider — CLAUDE.md). This keeps auth Supabase-native (sessions,
// JWTs, rate limits, OTP generation) while satisfying the MSG91 requirement.
//
// Configure in Supabase: Auth → Hooks → "Send SMS hook" → this function URL,
// with a shared secret (SEND_SMS_HOOK_SECRET) for HMAC verification.
//
// Required secrets (set via `supabase secrets set`):
//   MSG91_AUTH_KEY          — MSG91 account auth key
//   MSG91_SENDER_ID         — 6-char approved sender ID (e.g. "PLTYOS")
//   MSG91_OTP_TEMPLATE_ID   — DLT-approved OTP template id
//   SEND_SMS_HOOK_SECRET    — Supabase hook signing secret (base64, "v1,whsec_...")
//
// Until those are set this returns a clear 501 so local/dev flows fall back to
// email/password without a hard crash.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

// Supabase Send-SMS hook payload shape.
interface SendSmsHookPayload {
  user: { id: string; phone?: string };
  sms: { otp: string };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authKey = Deno.env.get("MSG91_AUTH_KEY") ?? "";
  const senderId = Deno.env.get("MSG91_SENDER_ID") ?? "";
  const templateId = Deno.env.get("MSG91_OTP_TEMPLATE_ID") ?? "";

  // TODO(prod): verify the Supabase hook HMAC signature against
  // SEND_SMS_HOOK_SECRET using the "webhook-signature" / "webhook-id" /
  // "webhook-timestamp" headers (standard-webhooks spec) before trusting body.

  if (!authKey || !senderId || !templateId) {
    // Not configured yet — surface clearly so the auth flow can fall back.
    return jsonResponse(
      { error: "MSG91 not configured", code: "msg91_unconfigured" },
      501,
    );
  }

  let payload: SendSmsHookPayload;
  try {
    payload = (await req.json()) as SendSmsHookPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const phone = payload?.user?.phone?.replace(/^\+/, "") ?? "";
  const otp = payload?.sms?.otp ?? "";
  if (!phone || !otp) {
    return jsonResponse({ error: "Missing phone or otp in hook payload" }, 400);
  }

  // MSG91 OTP send API. Uses a DLT-approved template with an {{otp}} variable.
  try {
    const res = await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey: authKey },
      body: JSON.stringify({
        template_id: templateId,
        mobile: phone,
        otp,
        sender: senderId,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.type === "error") {
      console.error("MSG91 send failed", res.status, body);
      return jsonResponse({ error: "SMS delivery failed", detail: body }, 502);
    }
    return jsonResponse({ delivered: true });
  } catch (err) {
    console.error("MSG91 fetch threw", err);
    return jsonResponse({ error: "SMS provider unreachable" }, 502);
  }
});
