// supabase/functions/_shared/send-email-client.ts
// =============================================================================
// Thin helper so other Edge Functions dispatch transactional email through the
// centralized `send-email` function (one provider path, one audit log) instead
// of calling Resend directly. Always best-effort — never throws into the caller.
// =============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DispatchEmailInput {
  recipient_email: string;
  email_type: string;
  template_id: string;
  template_data?: Record<string, unknown>;
  tenant_id?: string | null;
  reply_to?: string;
}

/** POST to the send-email Edge Function with the service-role token. */
export async function dispatchEmail(
  input: DispatchEmailInput,
): Promise<{ sent: boolean; reason?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return { sent: false, reason: "not_configured" };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      body: JSON.stringify({
        recipient_email: input.recipient_email,
        email_type: input.email_type,
        template_id: input.template_id,
        template_data: input.template_data ?? {},
        tenant_id: input.tenant_id ?? null,
        reply_to: input.reply_to,
      }),
    });
    const body = await res.json().catch(() => ({}));
    return { sent: Boolean(body?.sent), reason: body?.reason };
  } catch (err) {
    console.error("dispatchEmail: network error", err instanceof Error ? err.message : String(err));
    return { sent: false, reason: "network_error" };
  }
}

/**
 * Resolve a tenant owner's email (auth.users) via the Admin API. Returns null
 * when the tenant/owner can't be found. Reuses one service-role client.
 */
export async function resolveTenantOwnerEmail(
  tenantId: string,
): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return null;

  const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const { data: tenant } = await svc
    .from("tenants")
    .select("owner_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!tenant?.owner_id) return null;

  const { data: userRes } = await svc.auth.admin.getUserById(tenant.owner_id as string);
  return userRes?.user?.email ?? null;
}
