'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PhoneInput } from '@/components/PhoneInput';
import { isValidPhoneString } from '@/lib/constants/countries';

const schema = z.object({
  whatsapp_phone: z.string().refine((v) => isValidPhoneString(v), 'Enter a valid phone number'),
  whatsapp_opt_in: z.boolean(),
});
type Form = z.infer<typeof schema>;

interface Props { initialPhone: string; initialOptIn: boolean; }

export function WhatsAppSettingsForm({ initialPhone, initialOptIn }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { register, control, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { whatsapp_phone: initialPhone, whatsapp_opt_in: initialOptIn },
  });

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

      <div className="rounded-md bg-mute-soft p-md text-xs text-body">
        <p className="font-semibold text-ink mb-xs">What you'll receive (when opted in):</p>
        <ul className="space-y-xxs list-disc list-inside">
          <li>Daily digest at 8 PM IST — mortality, feed, market prices</li>
          <li>Mortality spike alerts (real-time)</li>
          <li>Vaccination reminders (1 day before)</li>
          <li>Heat-stress alerts (when ≥ threshold)</li>
          <li>Payment reminders for buyers (day 7 / 15 / 30 overdue)</li>
          <li>Low-stock alerts (feed, medicine)</li>
        </ul>
      </div>

      <div className="flex items-center gap-md">
        <button type="submit" disabled={loading} className="btn-primary">{loading ? 'Saving…' : 'Save'}</button>
        {saved && <span className="text-sm text-success-ink font-semibold">Saved ✓</span>}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}
