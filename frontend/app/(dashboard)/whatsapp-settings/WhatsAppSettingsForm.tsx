'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PhoneInput } from '@/components/PhoneInput';
import { isValidPhoneString } from '@/lib/constants/countries';

// Category keys = the 6 Meta-approved template ids that send-whatsapp-message
// gates on via profiles.whatsapp_preferences (per-category opt-out). Keep these
// in lockstep with the mobile settings screen + the Edge Function's allow-list.
const CATEGORIES: { key: string; label: string; hint: string }[] = [
  { key: 'mortality_alert', label: 'Mortality spike alerts', hint: 'Real-time when deaths exceed your threshold' },
  { key: 'heat_stress_alert', label: 'Heat-stress alerts', hint: 'When forecast ≥ your heat threshold' },
  { key: 'vaccination_reminder', label: 'Vaccination reminders', hint: '1 day before a dose is due' },
  { key: 'payment_reminder', label: 'Payment reminders', hint: 'Buyer dues at day 7 / 15 / 30 overdue' },
  { key: 'low_stock_alert', label: 'Low-stock alerts', hint: 'Feed / medicine below threshold' },
  { key: 'daily_digest', label: 'Daily digest', hint: '8 PM IST — mortality, feed, market prices' },
];

const schema = z.object({
  whatsapp_phone: z.string().refine((v) => isValidPhoneString(v), 'Enter a valid phone number'),
  whatsapp_opt_in: z.boolean(),
  preferences: z.record(z.boolean()),
});
type Form = z.infer<typeof schema>;

interface Props { initialPhone: string; initialOptIn: boolean; initialPreferences: Record<string, boolean> | null; }

export function WhatsAppSettingsForm({ initialPhone, initialOptIn, initialPreferences }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const stored = initialPreferences ?? {};
  const defaultPreferences = Object.fromEntries(
    CATEGORIES.map((c) => [c.key, stored[c.key] ?? true]),
  );

  const { register, control, watch, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { whatsapp_phone: initialPhone, whatsapp_opt_in: initialOptIn, preferences: defaultPreferences },
  });

  const optedIn = watch('whatsapp_opt_in');

  async function onSubmit(data: Form) {
    setError(null);
    setSaved(false);
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not signed in'); setLoading(false); return; }
    const { error } = await supabase
      .from('profiles')
      .update({
        whatsapp_phone: data.whatsapp_phone || null,
        whatsapp_opt_in: data.whatsapp_opt_in,
        whatsapp_preferences: data.preferences,
      })
      .eq('id', user.id);
    setLoading(false);
    if (error) return setError(error.message);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="card space-y-md">
      <div>
        <label className="label">WhatsApp number</label>
        <Controller control={control} name="whatsapp_phone" render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} />} />
        {errors.whatsapp_phone && <p className="text-sm text-danger mt-xs">{errors.whatsapp_phone.message}</p>}
      </div>

      <label className="flex items-start gap-md cursor-pointer">
        <input type="checkbox" className="size-5 mt-xxs" {...register('whatsapp_opt_in')} />
        <div>
          <p className="font-semibold text-ink">Receive WhatsApp notifications</p>
          <p className="text-sm text-body mt-xxs">
            Daily digest, mortality alerts, vaccination reminders, heat-stress warnings, payment reminders, low-stock alerts.
            Reply STOP anytime to unsubscribe.
          </p>
        </div>
      </label>

      <div className={`rounded-md border border-mute p-md transition-opacity ${optedIn ? '' : 'opacity-50'}`}>
        <p className="font-semibold text-ink mb-xs">Notification categories</p>
        <p className="text-xs text-body mb-md">Fine-tune which alerts reach you. Turn any off to stop just that type — your other alerts keep coming.</p>
        <div className="space-y-sm">
          {CATEGORIES.map((c) => (
            <label key={c.key} className="flex items-start gap-md cursor-pointer">
              <input type="checkbox" className="size-5 mt-xxs" disabled={!optedIn} {...register(`preferences.${c.key}` as const)} />
              <div>
                <p className="text-sm font-semibold text-ink">{c.label}</p>
                <p className="text-xs text-body-soft">{c.hint}</p>
              </div>
            </label>
          ))}
        </div>
        {!optedIn && <p className="mt-md text-xs text-body-soft">Turn on WhatsApp notifications above to choose categories.</p>}
      </div>

      <div className="flex items-center gap-md">
        <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Saving…' : 'Save'}</button>
        {saved && <span className="text-sm text-success-ink font-semibold">Saved ✓</span>}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
