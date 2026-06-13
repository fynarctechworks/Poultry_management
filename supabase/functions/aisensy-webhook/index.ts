// supabase/functions/aisensy-webhook/index.ts
// Called by:
//   1. AiSensy platform (registered webhook URL) — delivery-status callbacks
//   2. AiSensy platform — inbound messages from WhatsApp users
//
// Auth: HMAC-SHA256 signature verification (NOT service-role — this is a public webhook).
//   - When AISENSY_WEBHOOK_SECRET is set: verify X-AiSensy-Signature header against
//     HMAC-SHA256(secret, rawBody). Reject with 401 on mismatch.
//   - When AISENSY_WEBHOOK_SECRET is not configured: fail CLOSED (reject 401) by
//     default (SEC-6). Set ALLOW_UNSIGNED_WEBHOOKS=true to accept unsigned in dev only.
//
// Logic (delivery-status events):
//   - Update whatsapp_messages_log row where aisensy_message_id matches,
//     setting status = sent|delivered|read|failed and updated_at = now().
//
// Logic (inbound messages — opt-in management):
//   - STOP  → set profiles.whatsapp_opt_in = false for matching whatsapp_phone
//   - START / RESUME → set profiles.whatsapp_opt_in = true
//   - REPORT → log at info level; no DB write
//   - Unknown → return 200 {ok:true} (prevent AiSensy retry loops)
//
// Always return 200 for well-formed requests; 401 only on signature mismatch.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// CORS headers — mirror existing functions exactly
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-aisensy-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Zod schemas for the two AiSensy webhook event shapes we handle
// ---------------------------------------------------------------------------

// Delivery-status event
// AiSensy sends status updates for messages we sent via the campaign API.
const DeliveryEventSchema = z.object({
  type: z.literal("message_status").or(z.literal("status")),
  messageId: z.string().optional(),
  message_id: z.string().optional(), // some AiSensy versions use snake_case
  status: z.enum(["sent", "delivered", "read", "failed"]),
});

// Inbound message event — a WhatsApp user replied to us
const InboundMessageSchema = z.object({
  type: z.literal("message").or(z.literal("inbound_message")),
  from: z.string(), // sender phone (E.164 or local format)
  text: z
    .object({ body: z.string() })
    .or(z.object({ message: z.string() }))
    .optional(),
  body: z.string().optional(), // flat body in some versions
});

// ---------------------------------------------------------------------------
// Helper: JSON response with CORS
// ---------------------------------------------------------------------------
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Constant-time string comparison — avoids leaking the signature via the
// short-circuit timing of a naive ===/`.every()` comparison.
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ---------------------------------------------------------------------------
// Helper: normalise the message text from various AiSensy inbound shapes
// ---------------------------------------------------------------------------
function extractInboundText(payload: Record<string, unknown>): string {
  // Flat `body` field (v1 shape)
  if (typeof payload.body === "string") return payload.body;
  // Nested `text.body` (WhatsApp Cloud API forwarded shape)
  if (
    payload.text &&
    typeof payload.text === "object" &&
    "body" in (payload.text as Record<string, unknown>)
  ) {
    return String((payload.text as Record<string, unknown>).body ?? "");
  }
  // Nested `text.message`
  if (
    payload.text &&
    typeof payload.text === "object" &&
    "message" in (payload.text as Record<string, unknown>)
  ) {
    return String((payload.text as Record<string, unknown>).message ?? "");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---------------------------------------------------------------------------
  // 1. Read raw body bytes (needed for signature verification)
  // ---------------------------------------------------------------------------
  const rawBodyBytes = await req.arrayBuffer();
  const rawBodyText = new TextDecoder().decode(rawBodyBytes);

  // ---------------------------------------------------------------------------
  // 2. Signature verification (HMAC-SHA256 of raw body)
  //    Header name: X-AiSensy-Signature
  //    When secret is not configured: accept with a warning (dev/staging safety).
  // ---------------------------------------------------------------------------
  const webhookSecret = Deno.env.get("AISENSY_WEBHOOK_SECRET");
  const signatureHeader = req.headers.get("X-AiSensy-Signature");

  if (webhookSecret) {
    if (signatureHeader) {
      const expectedSig = createHmac("sha256", webhookSecret)
        .update(rawBodyText)
        .digest("hex");

      // Constant-time comparison to prevent timing attacks
      const sigMatch = constantTimeEquals(expectedSig, signatureHeader);

      if (!sigMatch) {
        console.warn("AiSensy webhook signature mismatch — rejecting request");
        return jsonResponse({ error: "Invalid signature" }, 401);
      }
    } else {
      // Secret configured but header missing — could be a probe; reject.
      console.warn("AISENSY_WEBHOOK_SECRET is set but X-AiSensy-Signature header is missing — rejecting");
      return jsonResponse({ error: "Missing signature header" }, 401);
    }
  } else if (Deno.env.get("ALLOW_UNSIGNED_WEBHOOKS") === "true") {
    // DEV ONLY escape hatch — pre-AiSensy-account-setup local testing.
    console.warn(
      "ALLOW_UNSIGNED_WEBHOOKS=true — accepting AiSensy webhook WITHOUT signature verification (DEV ONLY)",
    );
  } else {
    // SEC-6: fail CLOSED by default. Without a secret, forged inbound STOP/START
    // events could flip whatsapp_opt_in for any phone, and forged delivery-status
    // events could corrupt whatsapp_messages_log. Refuse rather than trust.
    console.error("AISENSY_WEBHOOK_SECRET not configured — refusing unsigned webhook");
    return jsonResponse({ error: "Webhook verification not configured" }, 401);
  }

  // ---------------------------------------------------------------------------
  // 3. Parse JSON body
  // ---------------------------------------------------------------------------
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBodyText);
  } catch {
    // Non-JSON body — return 200 so AiSensy stops retrying, but log the anomaly
    console.warn("AiSensy webhook received non-JSON body — ignoring");
    return jsonResponse({ ok: true, ignored: "non_json_body" });
  }

  // ---------------------------------------------------------------------------
  // 4. Service-role Supabase client (writes bypass RLS)
  // ---------------------------------------------------------------------------
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

  // ---------------------------------------------------------------------------
  // 5. Route by event type
  // ---------------------------------------------------------------------------
  const eventType = typeof payload.type === "string" ? payload.type : "";

  // -- 5a. Delivery-status event --
  if (eventType === "message_status" || eventType === "status") {
    const parsed = DeliveryEventSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn("Delivery event failed Zod validation:", parsed.error.flatten());
      // Still 200 — don't cause AiSensy to retry on schema mismatch
      return jsonResponse({ ok: true, ignored: "delivery_schema_mismatch" });
    }

    const messageId =
      parsed.data.messageId ?? parsed.data.message_id ?? null;

    if (!messageId) {
      console.warn("Delivery event missing messageId — cannot update log");
      return jsonResponse({ ok: true, ignored: "missing_message_id" });
    }

    const { error: updateError } = await supabase
      .from("whatsapp_messages_log")
      .update({
        status: parsed.data.status,
        updated_at: new Date().toISOString(),
      })
      .eq("aisensy_message_id", messageId);

    if (updateError) {
      console.error(
        `Failed to update whatsapp_messages_log for messageId ${messageId}:`,
        updateError.message,
      );
      // Still return 200 — logging failure should not cause AiSensy to retry
    }

    return jsonResponse({ ok: true, updated: messageId });
  }

  // -- 5b. Inbound message event (opt-in management) --
  if (eventType === "message" || eventType === "inbound_message") {
    const parsed = InboundMessageSchema.safeParse(payload);
    if (!parsed.success) {
      console.warn("Inbound message failed Zod validation:", parsed.error.flatten());
      return jsonResponse({ ok: true, ignored: "inbound_schema_mismatch" });
    }

    const senderPhone = parsed.data.from;
    const messageText = extractInboundText(payload).trim().toUpperCase();

    if (messageText === "STOP") {
      // Opt the sender out of WhatsApp messages
      const { error: optOutError } = await supabase
        .from("profiles")
        .update({
          whatsapp_opt_in: false,
          updated_at: new Date().toISOString(),
        })
        .eq("whatsapp_phone", senderPhone);

      if (optOutError) {
        console.error(
          `Failed to set whatsapp_opt_in=false for ${senderPhone}:`,
          optOutError.message,
        );
      } else {
        console.info(`WhatsApp opt-out processed for ${senderPhone}`);
      }

      return jsonResponse({ ok: true, action: "opt_out", phone: senderPhone });
    }

    if (messageText === "START" || messageText === "RESUME") {
      // Opt the sender back in
      const { error: optInError } = await supabase
        .from("profiles")
        .update({
          whatsapp_opt_in: true,
          updated_at: new Date().toISOString(),
        })
        .eq("whatsapp_phone", senderPhone);

      if (optInError) {
        console.error(
          `Failed to set whatsapp_opt_in=true for ${senderPhone}:`,
          optInError.message,
        );
      } else {
        console.info(`WhatsApp opt-in processed for ${senderPhone}`);
      }

      return jsonResponse({ ok: true, action: "opt_in", phone: senderPhone });
    }

    if (messageText === "REPORT") {
      // Acknowledge and log; no DB change needed
      console.info(`WhatsApp REPORT command received from ${senderPhone}`);
      return jsonResponse({ ok: true, action: "report_acknowledged", phone: senderPhone });
    }

    // Unknown inbound message — return 200 to prevent AiSensy retry loops
    console.info(
      `Unhandled inbound message from ${senderPhone}: "${messageText.slice(0, 80)}"`,
    );
    return jsonResponse({ ok: true, action: "unhandled_inbound" });
  }

  // ---------------------------------------------------------------------------
  // 6. Unknown event type — return 200 to prevent AiSensy retry loops
  // ---------------------------------------------------------------------------
  console.info(`Unknown AiSensy webhook event type: "${eventType}"`);
  return jsonResponse({ ok: true, ignored: "unknown_event_type" });
});
