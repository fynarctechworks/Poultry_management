import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sendTransactionalEmail } from '@/lib/email/send';

/**
 * OAuth/PKCE + email-confirmation callback. Supabase redirects here with a
 * `code` after the user authenticates (OAuth) OR clicks the email confirmation
 * link; we exchange it for a session and forward to `next`.
 *
 * Welcome email: the post-signup confirmation link sets `next=/onboarding`
 * (see the register page's emailRedirectTo). We fire a one-time welcome email on
 * that path only — OAuth sign-ins (default next=/multi-farm) do not trigger it.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/multi-farm';

  if (code) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // First-confirmation path → welcome email (best-effort, never blocks login).
      if (next.startsWith('/onboarding') && data.user?.email) {
        await sendTransactionalEmail({
          to: data.user.email,
          emailType: 'welcome',
          templateId: 'welcome',
          data: {
            name: (data.user.user_metadata?.full_name as string) ?? undefined,
            dashboardUrl: `${origin}/onboarding`,
          },
        }).catch(() => {});
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
