import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, farm_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.farm_id) {
    redirect('/onboarding');
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar userName={profile?.full_name ?? user.email ?? 'Owner'} />
      <main className="flex-1 px-2xl py-xl overflow-x-auto">{children}</main>
    </div>
  );
}
