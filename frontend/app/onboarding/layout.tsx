import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  // Split-screen shell that mirrors the (auth) layout: branded Silk panel on the
  // left, scrollable form column on the right. The wizard itself renders both.
  return <main className="flex min-h-screen bg-canvas">{children}</main>;
}
