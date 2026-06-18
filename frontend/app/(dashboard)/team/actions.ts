'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sendTransactionalEmail } from '@/lib/email/send';

/**
 * Sends a tenant-invitation email after the farm_users row has been recorded
 * client-side. Server action so the service-role email call stays off the
 * client. Best-effort: a failed email never invalidates the recorded invite
 * (the phone/WhatsApp path remains primary). Returns whether the email sent.
 *
 * Auth: requires a signed-in user; only sends for a farm the caller owns.
 */
export async function sendInvitationEmail(params: {
  email: string;
  farmId: string;
  role: 'worker' | 'vet';
}): Promise<{ sent: boolean; reason?: string }> {
  const email = params.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { sent: false, reason: 'invalid_email' };
  }

  const supabase = createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { sent: false, reason: 'unauthenticated' };

  // Verify the caller owns the target farm (defense-in-depth atop RLS) and
  // gather context for the email copy.
  const { data: farm } = await supabase
    .from('farms')
    .select('id, farm_name, tenant_id, owner_id')
    .eq('id', params.farmId)
    .maybeSingle();

  if (!farm || farm.owner_id !== auth.user.id) {
    return { sent: false, reason: 'not_farm_owner' };
  }

  const inviterName =
    (auth.user.user_metadata?.full_name as string) ?? auth.user.email ?? 'A farm owner';
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? '';

  const result = await sendTransactionalEmail({
    to: email,
    emailType: 'tenant_invitation',
    templateId: 'tenant_invitation',
    tenantId: farm.tenant_id ?? null,
    data: {
      inviterName,
      farmName: farm.farm_name,
      role: params.role === 'vet' ? 'Vet' : 'Worker',
      inviteUrl: origin ? `${origin}/login` : undefined,
    },
  });

  return { sent: result.sent, reason: result.reason };
}
