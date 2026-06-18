import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ProfileForm } from './ProfileForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function SettingsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, phone, whatsapp_phone, whatsapp_opt_in, role, subscription_status')
    .eq('id', user!.id)
    .maybeSingle();

  return (
    <div className="max-w-[800px] mx-auto">
      <PageHeader eyebrow="Account" title="Settings" subtitle="Your profile, farm preferences and access." />

      <h2 className="text-lg font-bold text-ink mb-md">Profile</h2>
      <ProfileForm
        userId={user!.id}
        initial={{
          full_name: profile?.full_name ?? '',
          phone: profile?.phone ?? '',
          whatsapp_phone: profile?.whatsapp_phone ?? '',
          whatsapp_opt_in: profile?.whatsapp_opt_in ?? false,
        }}
      />

      <h2 className="text-lg font-bold text-ink mb-md mt-2xl">Account</h2>
      <div className="card space-y-md">
        <Row label="Email" value={user?.email ?? '—'} />
        <Row label="Role" value={profile?.role ?? '—'} />
        <Row label="Subscription" value={profile?.subscription_status ?? 'free'} />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-mute last:border-0 pb-md last:pb-0">
      <span className="text-sm text-body">{label}</span>
      <span className="text-sm font-semibold text-ink">{value}</span>
    </div>
  );
}
