// supabase/functions/send-email/index.ts
// =============================================================================
// Centralized transactional email sender (Layer 2 — Resend HTTP API).
// The SINGLE path for every app-level email. Mirrors send-whatsapp-message:
//   - service-role Bearer/apikey auth only (no user JWT)
//   - Zod-validated payload
//   - renders branded HTML+text via _shared/email-templates.ts
//   - bounded exponential retry (network / 5xx only)
//   - ALWAYS inserts an email_messages_log row (success AND failure)
//   - graceful "not_configured" path when RESEND_API_KEY is absent, so this
//     function deploys safely BEFORE the Resend account exists.
//
// NEVER throw on provider failure — logging the failure row IS the success path.
// NEVER expose RESEND_API_KEY or the service role key in responses or logs.
//
// Callers (service-role):
//   - frontend/app/auth/callback (welcome)
//   - team invitation server action (tenant_invitation)
//   - subscription-lifecycle / razorpay-webhook (billing + payment)
//   - auth/security hooks (login_alert, password_changed, email_changed)
// =============================================================================

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  DEFAULT_BRAND,
  EmailBrand,
  renderEmail,
  SUPPORTED_TEMPLATE_IDS,
} from "../_shared/email-templates.ts";

const EMAIL_TYPES = [
  "verify_email", "welcome", "password_reset", "password_changed",
  "email_changed", "login_alert", "tenant_invitation", "trial_started",
  "trial_expiring", "subscription_activated", "subscription_expired",
  "payment_success", "payment_failed", "security_alert", "system_notification",
] as const;

const PayloadSchema = z.object({
  recipient_email: z.string().email(),
  email_type: z.enum(EMAIL_TYPES),
  template_id: z.string().min(1),
  template_data: z.record(z.unknown()).default({}),
  tenant_id: z.string().uuid().nullable().optional(),
  reply_to: z.string().email().optional(),
  // Optional per-call brand override (white-label / multi-tenant). Partial-merged
  // over DEFAULT_BRAND so callers only pass what differs.
  brand: z
    .object({
      productName: z.string().optional(),
      fromName: z.string().optional(),
      supportEmail: z.string().email().optional(),
      baseUrl: z.string().url().optional(),
      accentInk: z.string().optional(),
    })
    .optional(),
});

type Payload = z.infer<typeof PayloadSchema>;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // -------------------------------------------------------------------------
  // 1. Auth — service role only (verbatim with send-whatsapp-message)
  // -------------------------------------------------------------------------
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");
  const providedToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isAuthorized =
    (providedToken && providedToken === serviceRoleKey) ||
    (apikeyHeader && apikeyHeader === serviceRoleKey);
  if (!isAuthorized) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  // -------------------------------------------------------------------------
  // 2. Parse + validate
  // -------------------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }
  const parsed = PayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(
      { error: "Validation failed", details: parsed.error.flatten() },
      400,
    );
  }
  const payload: Payload = parsed.data;

  if (!SUPPORTED_TEMPLATE_IDS.includes(payload.template_id)) {
    return jsonResponse(
      {
        error: "Unknown template_id",
        message: `template_id '${payload.template_id}' is not registered. Supported: ${SUPPORTED_TEMPLATE_IDS.join(", ")}`,
      },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // -------------------------------------------------------------------------
  // 3. Resolve brand (env defaults + per-call override) and render
  // -------------------------------------------------------------------------
  const brand: EmailBrand = {
    ...DEFAULT_BRAND,
    productName: Deno.env.get("MAIL_PRODUCT_NAME") ?? DEFAULT_BRAND.productName,
    fromName: Deno.env.get("MAIL_SENDER_NAME") ?? DEFAULT_BRAND.fromName,
    supportEmail: Deno.env.get("MAIL_REPLY_TO") ?? DEFAULT_BRAND.supportEmail,
    baseUrl: Deno.env.get("MAIL_APP_URL") ?? DEFAULT_BRAND.baseUrl,
    ...(payload.brand ?? {}),
  };

  let rendered;
  try {
    rendered = renderEmail(payload.template_id, payload.template_data, brand);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logEmail(supabase, payload, null, "failed", msg, 0, null);
    return jsonResponse({ sent: false, reason: "render_error", error: msg }, 400);
  }

  const fromAddress = Deno.env.get("MAIL_FROM"); // e.g. "PoultryOS <noreply@poultryosadmin.infynarc.com>"
  const replyTo = payload.reply_to ?? brand.supportEmail;

  // -------------------------------------------------------------------------
  // 4. Graceful degrade — no Resend key yet => log + return, do NOT throw.
  // -------------------------------------------------------------------------
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey || !fromAddress) {
    const reason = !resendApiKey ? "RESEND_API_KEY not configured" : "MAIL_FROM not configured";
    console.warn(`send-email: ${reason} — logging failure, skipping send`);
    const logId = await logEmail(
      supabase, payload, rendered.subject, "failed", reason, 0, null,
    );
    return jsonResponse({ sent: false, reason: "not_configured", log_id: logId });
  }

  // -------------------------------------------------------------------------
  // 5. Send via Resend with bounded exponential retry (network / 5xx only)
  // -------------------------------------------------------------------------
  const MAX_ATTEMPTS = 3;
  let resendMessageId: string | null = null;
  let status: "sent" | "failed" = "failed";
  let errorMessage: string | null = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts = attempt;
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [payload.recipient_email],
          reply_to: replyTo,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          tags: [{ name: "email_type", value: payload.email_type }],
        }),
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        resendMessageId = (body?.id as string) ?? null;
        status = "sent";
        errorMessage = null;
        break;
      }

      errorMessage = await res.text().catch(() => `HTTP ${res.status}`);
      // 4xx (bad address/payload) is not retryable; 429/5xx is.
      const retryable = res.status === 429 || res.status >= 500;
      console.warn(`send-email: Resend HTTP ${res.status} (attempt ${attempt}) — ${errorMessage}`);
      if (!retryable) break;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`send-email: network error (attempt ${attempt}) — ${errorMessage}`);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(300 * 2 ** (attempt - 1)); // 300ms, 600ms
  }

  // -------------------------------------------------------------------------
  // 6. Audit log — always
  // -------------------------------------------------------------------------
  const logId = await logEmail(
    supabase, payload, rendered.subject, status, errorMessage, attempts, resendMessageId,
  );

  if (status === "sent") {
    return jsonResponse({ sent: true, log_id: logId, resend_message_id: resendMessageId });
  }
  return jsonResponse({ sent: false, reason: "resend_error", log_id: logId, error: errorMessage });
});

// ---------------------------------------------------------------------------
// Audit-log helper. Never throws — a logging failure must not break the caller.
// ---------------------------------------------------------------------------
async function logEmail(
  supabase: ReturnType<typeof createClient>,
  payload: Payload,
  subject: string | null,
  status: string,
  errorMessage: string | null,
  attempts: number,
  resendMessageId: string | null,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("email_messages_log")
      .insert({
        tenant_id: payload.tenant_id ?? null,
        recipient_email: payload.recipient_email,
        email_type: payload.email_type,
        template_id: payload.template_id,
        subject,
        payload_json: { template_data: payload.template_data },
        resend_message_id: resendMessageId,
        status,
        error_message: errorMessage,
        attempts,
      })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("send-email: failed to insert email_messages_log:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("send-email: log insert threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}
