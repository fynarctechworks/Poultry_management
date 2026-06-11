import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return (
    <main className="min-h-screen bg-canvas-soft px-lg py-2xl">
      <div className="max-w-[720px] mx-auto">{children}</div>
    </main>
  );
}
