import { createSupabaseServerClient } from '@/lib/supabase/server';
import { WhatsAppSettingsForm } from './WhatsAppSettingsForm';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function WhatsAppSettingsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('whatsapp_phone, whatsapp_opt_in, whatsapp_preferences')
    .eq('id', user!.id)
    .maybeSingle();

  return (
    <div className="max-w-[720px] mx-auto">
      <PageHeader
        eyebrow="Account"
        title="WhatsApp settings"
        subtitle="Choose what reaches you on WhatsApp. We never message without consent."
        orbs={['mint', 'peach']}
      />
      <WhatsAppSettingsForm
        initialPhone={profile?.whatsapp_phone ?? ''}
        initialOptIn={!!profile?.whatsapp_opt_in}
        initialPreferences={(profile?.whatsapp_preferences as Record<string, boolean> | null) ?? null}
      />
    </div>
  );
}
