'use server';

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sendTransactionalEmail } from '@/lib/email/send';

/**
 * Fires a "your password was changed" security email to the currently signed-in
 * user. Called right after a successful password update. Best-effort — a failed
 * email must never surface as a reset error. Reads the email server-side from
 * the session so the client can't spoof a recipient.
 */
export async function notifyPasswordChanged(): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return;

  await sendTransactionalEmail({
    to: email,
    emailType: 'password_changed',
    templateId: 'password_changed',
    data: {
      email,
      when: new Date().toUTCString(),
    },
  }).catch(() => {});
}
