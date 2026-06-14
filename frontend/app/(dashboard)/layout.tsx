import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Sidebar } from '@/components/Sidebar';
import { getBillingSummary } from '@/lib/subscription';
import { SubscriptionBanners } from '@/components/SubscriptionBanners';
import { CanWriteProvider } from '@/components/CanWriteProvider';

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

  // Phase D: subscription state drives the global banners + read-only gating.
  const billing = await getBillingSummary();
  const canWrite = billing?.can_write ?? true;

  return (
    <CanWriteProvider canWrite={canWrite}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar userName={profile?.full_name ?? user.email ?? 'Owner'} />
        <main className="flex-1 min-h-0 px-2xl py-xl overflow-y-auto">
          {billing && (
            <SubscriptionBanners
              status={billing.status}
              isPaid={billing.is_paid}
              canWrite={billing.can_write}
              daysRemaining={billing.days_remaining}
              renewalAt={billing.renewal_at}
              planName={billing.plan?.name ?? null}
            />
          )}
          {children}
        </main>
      </div>
    </CanWriteProvider>
  );
}
