import { createSupabaseServerClient } from '@/lib/supabase/server';
import { WhatsAppSettingsForm } from './WhatsAppSettingsForm';

export default async function WhatsAppSettingsPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from('profiles')
    .select('whatsapp_phone, whatsapp_opt_in')
    .eq('id', user!.id)
    .maybeSingle();

  return (
    <div className="max-w-[720px] mx-auto">
      <h1 className="text-3xl font-bold text-ink mb-xs">WhatsApp settings</h1>
      <p className="text-sm text-body mb-2xl">Choose what reaches you on WhatsApp. We never message without consent.</p>
      <WhatsAppSettingsForm
        initialPhone={profile?.whatsapp_phone ?? ''}
        initialOptIn={!!profile?.whatsapp_opt_in}
      />
    </div>
  );
}
