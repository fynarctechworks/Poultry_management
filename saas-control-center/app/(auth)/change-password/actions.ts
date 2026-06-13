'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/control/serviceClient';

/**
 * Clears the admin-only `force_password_change` flag for the *currently signed-in*
 * user. Called by the change-password page after the new password is set.
 *
 * The flag lives in app_metadata (operator cannot edit it), so clearing it
 * requires the service role — done here, server-side, scoped to the caller's own
 * id resolved from their authed session. No id is accepted from the client.
 */
export async function clearForcePasswordChange(): Promise<{ ok: boolean; error?: string }> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const service = createServiceClient();
  const { error } = await service.auth.admin.updateUserById(user.id, {
    app_metadata: { ...user.app_metadata, force_password_change: false },
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
