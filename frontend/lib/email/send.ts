/**
 * Server-only client for the centralized `send-email` Supabase Edge Function.
 * (Imported exclusively from server routes / server actions — it reads
 * SUPABASE_SERVICE_ROLE_KEY, which is never exposed to the browser.)
 *
 * This is the ONLY place the web app talks to the email layer — every page,
 * route, or server action that needs to send a transactional email calls
 * `sendTransactionalEmail`, never the provider (Resend) directly. The Edge
 * Function owns provider creds, branding, retry, and the audit log.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (server-only) to authorize the call.
 * Degrades gracefully: if creds are missing it returns { sent:false } without
 * throwing, so callers never break a user flow because email isn't wired yet.
 */

export type EmailType =
  | 'verify_email'
  | 'welcome'
  | 'password_reset'
  | 'password_changed'
  | 'email_changed'
  | 'login_alert'
  | 'tenant_invitation'
  | 'trial_started'
  | 'trial_expiring'
  | 'subscription_activated'
  | 'subscription_expired'
  | 'payment_success'
  | 'payment_failed'
  | 'security_alert'
  | 'system_notification';

export interface SendTransactionalEmailInput {
  to: string;
  emailType: EmailType;
  /** template id registered in supabase/functions/_shared/email-templates.ts */
  templateId: EmailType | string;
  data?: Record<string, unknown>;
  tenantId?: string | null;
  replyTo?: string;
}

export interface SendTransactionalEmailResult {
  sent: boolean;
  reason?: string;
  logId?: string | null;
}

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
): Promise<SendTransactionalEmailResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.warn('sendTransactionalEmail: Supabase admin creds missing — skipping send');
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetch(`${url}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        recipient_email: input.to,
        email_type: input.emailType,
        template_id: input.templateId,
        template_data: input.data ?? {},
        tenant_id: input.tenantId ?? null,
        reply_to: input.replyTo,
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      sent?: boolean;
      reason?: string;
      log_id?: string | null;
      error?: string;
    };

    if (!res.ok) {
      console.warn(`sendTransactionalEmail: send-email returned HTTP ${res.status}`, body?.error);
      return { sent: false, reason: body?.reason ?? `http_${res.status}`, logId: body?.log_id ?? null };
    }

    return { sent: body.sent ?? false, reason: body.reason, logId: body.log_id ?? null };
  } catch (err) {
    console.error('sendTransactionalEmail: network error', err instanceof Error ? err.message : err);
    return { sent: false, reason: 'network_error' };
  }
}
