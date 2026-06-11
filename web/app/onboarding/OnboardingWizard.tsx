'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface FormState {
  // Step 1: Farm info
  farm_name: string;
  owner_name: string;
  state: string;
  district: string;
  phone: string;
  gstin: string;
  // Step 2: Farm type + UPI
  farm_type: 'independent' | 'contract';
  upi_id: string;
  // Step 3: Sheds (1 shed for now)
  shed_name: string;
  shed_capacity: number;
  shed_poultry_type: 'broiler' | 'layer' | 'breeder';
  // Step 4: First batch
  add_batch: boolean;
  breed_name: string;
  opening_bird_count: number;
  placement_date: string;
  cost_per_bird: number;
  // Step 5: WhatsApp
  whatsapp_phone: string;
  whatsapp_opt_in: boolean;
}

const STEPS = ['Farm info', 'Farm type', 'First shed', 'First batch', 'WhatsApp'] as const;

export function OnboardingWizard() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    farm_name: '', owner_name: '', state: '', district: '', phone: '', gstin: '',
    farm_type: 'independent', upi_id: '',
    shed_name: 'Shed 1', shed_capacity: 1000, shed_poultry_type: 'broiler',
    add_batch: false, breed_name: 'Cobb 500', opening_bird_count: 0,
    placement_date: new Date().toISOString().slice(0, 10), cost_per_bird: 0,
    whatsapp_phone: '', whatsapp_opt_in: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function next() {
    setError(null);
    if (step === 0 && (!form.farm_name || !form.state || !form.district)) {
      return setError('Farm name, state, and district are required.');
    }
    if (step === 1 && form.upi_id && !/^[\w.\-]+@[\w.\-]+$/.test(form.upi_id)) {
      return setError('Invalid UPI ID. Format: name@bank');
    }
    if (step === 2 && (!form.shed_name || !form.shed_capacity)) {
      return setError('Shed name and capacity required.');
    }
    if (step === 3 && form.add_batch && !form.opening_bird_count) {
      return setError('Enter opening bird count or skip the batch.');
    }
    setStep(step + 1);
  }

  async function finish() {
    setError(null);
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { data: farm, error: farmErr } = await supabase.from('farms').insert({
        owner_id: user.id,
        farm_name: form.farm_name,
        owner_name: form.owner_name || null,
        state: form.state,
        district: form.district,
        phone: form.phone || null,
        gstin: form.gstin || null,
        farm_type: form.farm_type,
        upi_id: form.upi_id || null,
      }).select('id').single();
      if (farmErr) throw farmErr;

      await supabase.from('profiles').update({ farm_id: farm!.id }).eq('id', user.id);

      const { data: shed, error: shedErr } = await supabase.from('sheds').insert({
        farm_id: farm!.id,
        shed_name: form.shed_name,
        capacity: form.shed_capacity,
        poultry_type: form.shed_poultry_type,
        status: 'active',
      }).select('id').single();
      if (shedErr) throw shedErr;

      if (form.add_batch && form.opening_bird_count > 0) {
        const { error: batchErr } = await supabase.from('batches').insert({
          shed_id: shed!.id,
          farm_id: farm!.id,
          breed_name: form.breed_name,
          poultry_type: form.shed_poultry_type,
          placement_date: form.placement_date,
          opening_bird_count: form.opening_bird_count,
          current_bird_count: form.opening_bird_count,
          cost_per_bird: form.cost_per_bird || null,
          status: 'active',
        });
        if (batchErr) throw batchErr;
      }

      if (form.whatsapp_phone || form.whatsapp_opt_in) {
        await supabase.from('profiles').update({
          whatsapp_phone: form.whatsapp_phone || null,
          whatsapp_opt_in: form.whatsapp_opt_in,
        }).eq('id', user.id);
      }

      router.push('/multi-farm');
      router.refresh();
    } catch (e: any) {
      setError(e.message ?? 'Failed to complete onboarding');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ol className="flex items-center gap-sm mb-2xl">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex-1 text-center text-xs font-semibold py-sm rounded-md ${
            i === step ? 'bg-primary text-on-primary' :
            i < step ? 'bg-success-soft text-success-ink' :
            'bg-mute-soft text-body'
          }`}>{i + 1}. {s}</li>
        ))}
      </ol>

      <div className="card">
        {step === 0 && (
          <>
            <h2 className="text-2xl font-bold text-ink mb-md">Tell us about your farm</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <Field label="Farm name *"><input className="input" value={form.farm_name} onChange={(e) => set('farm_name', e.target.value)} /></Field>
              <Field label="Owner name"><input className="input" value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} /></Field>
              <Field label="State *"><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="Telangana" /></Field>
              <Field label="District *"><input className="input" value={form.district} onChange={(e) => set('district', e.target.value)} placeholder="Hyderabad" /></Field>
              <Field label="Farm phone"><input className="input" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+91XXXXXXXXXX" /></Field>
              <Field label="GSTIN"><input className="input" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} /></Field>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-2xl font-bold text-ink mb-md">How do you operate?</h2>
            <div className="space-y-md">
              <button
                onClick={() => set('farm_type', 'independent')}
                className={`block w-full text-left p-md rounded-card border-2 ${form.farm_type === 'independent' ? 'border-primary bg-primary-subtle' : 'border-mute'}`}
              >
                <p className="font-bold text-ink">Independent farm</p>
                <p className="text-sm text-body">I buy my own chicks and feed, sell to local buyers / mandis.</p>
              </button>
              <button
                onClick={() => set('farm_type', 'contract')}
                className={`block w-full text-left p-md rounded-card border-2 ${form.farm_type === 'contract' ? 'border-primary bg-primary-subtle' : 'border-mute'}`}
              >
                <p className="font-bold text-ink">Contract farm</p>
                <p className="text-sm text-body">An integrator (Suguna, Venkateshwara, etc.) supplies chicks & feed, takes the birds at harvest.</p>
              </button>
              <Field label="Your UPI ID (for buyer payments)">
                <input className="input" placeholder="yourname@okhdfcbank" value={form.upi_id} onChange={(e) => set('upi_id', e.target.value)} />
              </Field>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-2xl font-bold text-ink mb-md">Your first shed</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <Field label="Shed name *"><input className="input" value={form.shed_name} onChange={(e) => set('shed_name', e.target.value)} /></Field>
              <Field label="Capacity (birds) *"><input type="number" min={1} className="input" value={form.shed_capacity} onChange={(e) => set('shed_capacity', +e.target.value)} /></Field>
              <Field label="Type">
                <select className="input" value={form.shed_poultry_type} onChange={(e) => set('shed_poultry_type', e.target.value as any)}>
                  <option value="broiler">Broiler</option>
                  <option value="layer">Layer</option>
                  <option value="breeder">Breeder</option>
                </select>
              </Field>
            </div>
            <p className="text-xs text-body-soft mt-md">You can add more sheds later from Farms → Sheds.</p>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-2xl font-bold text-ink mb-md">Already have birds in?</h2>
            <label className="flex items-center gap-sm mb-md text-sm">
              <input type="checkbox" className="size-4" checked={form.add_batch} onChange={(e) => set('add_batch', e.target.checked)} />
              <span>Yes, add my current batch</span>
            </label>
            {form.add_batch && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <Field label="Breed"><input className="input" value={form.breed_name} onChange={(e) => set('breed_name', e.target.value)} /></Field>
                <Field label="Placement date"><input type="date" className="input" value={form.placement_date} onChange={(e) => set('placement_date', e.target.value)} /></Field>
                <Field label="Opening birds *"><input type="number" min={1} className="input" value={form.opening_bird_count || ''} onChange={(e) => set('opening_bird_count', +e.target.value)} /></Field>
                <Field label="Cost per bird (₹)"><input type="number" step="0.01" className="input" value={form.cost_per_bird || ''} onChange={(e) => set('cost_per_bird', +e.target.value)} /></Field>
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-2xl font-bold text-ink mb-md">WhatsApp updates</h2>
            <p className="text-sm text-body mb-md">We send the daily digest, mortality alerts, heat warnings, and payment reminders on WhatsApp.</p>
            <Field label="WhatsApp number"><input className="input" placeholder="+91XXXXXXXXXX" value={form.whatsapp_phone} onChange={(e) => set('whatsapp_phone', e.target.value)} /></Field>
            <label className="flex items-center gap-sm mt-md text-sm">
              <input type="checkbox" className="size-4" checked={form.whatsapp_opt_in} onChange={(e) => set('whatsapp_opt_in', e.target.checked)} />
              <span>Send me WhatsApp notifications (you can change later in WhatsApp settings)</span>
            </label>
          </>
        )}

        {error && <p className="text-sm text-danger mt-md">{error}</p>}

        <div className="flex items-center justify-between mt-2xl">
          <button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0 || loading} className="btn-subtle">
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={next} className="btn-primary">Next</button>
          ) : (
            <button onClick={finish} disabled={loading} className="btn-primary">
              {loading ? 'Setting up…' : 'Finish setup'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
