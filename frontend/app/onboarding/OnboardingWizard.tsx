'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PhoneInput } from '@/components/PhoneInput';
import { isValidPhone, parsePhone } from '@/lib/constants/countries';
import { SignupProgress, SIGNUP_STEPS, type SignupStepIndex } from '@/components/signup/SignupProgress';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type StepKey = 'farm' | 'plan' | 'billing' | 'payment' | 'complete';
const STEP_TO_PROGRESS: Record<StepKey, SignupStepIndex> = {
  farm: 2, plan: 3, billing: 4, payment: 5, complete: 6,
};

interface Plan {
  id: string; code: string; name: string; tier: string;
  monthly_price_inr: number; yearly_price_inr: number;
  is_contactable: boolean; recommended: boolean; features_json: Record<string, unknown>;
}

interface FarmForm {
  farm_name: string; owner_name: string; state: string; district: string;
  phone: string; gstin: string; farm_type: 'independent' | 'contract'; integrator_id: string; upi_id: string;
  whatsapp_phone: string; whatsapp_opt_in: boolean;
}
interface Integrator { id: string; name: string; }
interface BillingForm {
  billing_name: string; company_name: string; gstin: string; email: string; phone: string;
  address_line1: string; city: string; state: string; postal_code: string; country: string;
}

const FEATURE_LABELS: Record<string, string> = {
  vet_access: 'Vet collaboration', contract_farming: 'Contract farming',
  traceability_pdf: 'Traceability QR & PDF', multi_farm_dashboard: 'Multi-farm dashboard',
  whatsapp_alerts_per_month: 'WhatsApp alerts/mo', max_buyers: 'Buyers',
  dedicated_support: 'Dedicated support', sso: 'SSO',
};

function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && (window as any).Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ---------------------------------------------------------------------------
export function OnboardingWizard() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [step, setStep] = useState<StepKey>('farm');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  const [integrators, setIntegrators] = useState<Integrator[]>([]);
  const [farm, setFarm] = useState<FarmForm>({
    farm_name: '', owner_name: '', state: '', district: '', phone: '', gstin: '',
    farm_type: 'independent', integrator_id: '', upi_id: '', whatsapp_phone: '', whatsapp_opt_in: true,
  });
  const [billing, setBilling] = useState<BillingForm>({
    billing_name: '', company_name: '', gstin: '', email: '', phone: '',
    address_line1: '', city: '', state: '', postal_code: '', country: 'IN',
  });

  // Load plans + any pre-existing tenant (resume) + prefill billing email.
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setBilling((b) => ({ ...b, email: b.email || user.email! }));

      const { data: existingTenant } = await supabase.from('tenants').select('id').maybeSingle();
      if (existingTenant?.id) setTenantId(existingTenant.id);

      const { data } = await supabase
        .from('subscription_plans')
        .select('id, code, name, tier, monthly_price_inr, yearly_price_inr, is_contactable, recommended, features_json')
        .eq('is_active', true)
        .order('sort_order');
      setPlans((data ?? []) as Plan[]);

      // Integrators for the contract-farm path (any authenticated user may read).
      const { data: ints } = await supabase.from('integrators').select('id, name').order('name');
      setIntegrators((ints ?? []) as Integrator[]);
    })();
  }, [supabase]);

  const fset = <K extends keyof FarmForm>(k: K, v: FarmForm[K]) => setFarm((f) => ({ ...f, [k]: v }));
  const bset = <K extends keyof BillingForm>(k: K, v: BillingForm[K]) => setBilling((b) => ({ ...b, [k]: v }));

  // ---- Step 1: Farm info → create tenant + farm via atomic RPC ------------
  async function submitFarm() {
    setError(null);
    if (!farm.farm_name || !farm.state || !farm.district) return setError('Farm name, state, and district are required.');
    if (farm.farm_type === 'contract' && !farm.integrator_id) return setError('Select your integrator for a contract farm.');
    if (farm.phone) { const { country, national } = parsePhone(farm.phone); if (!isValidPhone(country, national)) return setError(`Enter a valid ${country.name} phone number.`); }
    if (farm.upi_id && !/^[\w.\-]+@[\w.\-]+$/.test(farm.upi_id)) return setError('Invalid UPI ID. Format: name@bank');

    setBusy(true);
    try {
      if (!tenantId) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error: rpcErr } = await supabase.rpc('create_tenant_onboarding', {
          payload: {
            tenant_name: farm.farm_name,
            full_name: farm.owner_name || user?.user_metadata?.full_name || null,
            whatsapp_phone: farm.whatsapp_phone || null,
            whatsapp_opt_in: farm.whatsapp_opt_in,
            farm: {
              farm_name: farm.farm_name, owner_name: farm.owner_name || null,
              state: farm.state, district: farm.district, phone: farm.phone || null,
              gstin: farm.gstin || null, farm_type: farm.farm_type,
              integrator_id: farm.farm_type === 'contract' ? farm.integrator_id : null,
              upi_id: farm.upi_id || null,
            },
          },
        });
        if (rpcErr) {
          // Re-entry after partial signup: tenant already exists → load it.
          if (!String(rpcErr.message).includes('already exists')) throw rpcErr;
          const { data: t } = await supabase.from('tenants').select('id').maybeSingle();
          setTenantId(t?.id ?? null);
        } else {
          setTenantId((data as { tenant_id: string }).tenant_id);
        }
      }
      // prefill billing from farm
      setBilling((b) => ({ ...b, billing_name: b.billing_name || farm.owner_name || farm.farm_name, gstin: b.gstin || farm.gstin, state: b.state || farm.state, phone: b.phone || farm.phone }));
      setStep('plan');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create your farm.');
    } finally { setBusy(false); }
  }

  // ---- Step 2: Plan select ------------------------------------------------
  function pickPlan(p: Plan) {
    setSelectedPlan(p);
    const price = cycle === 'monthly' ? p.monthly_price_inr : p.yearly_price_inr;
    if (p.is_contactable) { window.location.href = `mailto:sales@poultryos.app?subject=Enterprise plan enquiry`; return; }
    if (Number(price) === 0) { void startFree(p); return; }
    setStep('billing');
  }

  // Free plan: no card, just set the plan and finish.
  async function startFree(p: Plan) {
    setBusy(true);
    try {
      await supabase.from('tenant_subscriptions').update({ plan_id: p.id, billing_cycle: cycle }).eq('tenant_id', tenantId!);
      setStep('complete');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed.'); } finally { setBusy(false); }
  }

  // ---- Step 3: Billing info → upsert billing_profiles ---------------------
  async function submitBilling() {
    setError(null);
    if (!billing.billing_name || !billing.email) return setError('Billing name and email are required.');
    if (!tenantId) return setError('Missing tenant. Please restart.');
    setBusy(true);
    try {
      const { error: upErr } = await supabase.from('billing_profiles').upsert({
        tenant_id: tenantId, billing_name: billing.billing_name, company_name: billing.company_name || null,
        gstin: billing.gstin || null, email: billing.email, phone: billing.phone || null,
        address_line1: billing.address_line1 || null, city: billing.city || null,
        state: billing.state || null, postal_code: billing.postal_code || null, country: billing.country || 'IN',
      }, { onConflict: 'tenant_id' });
      if (upErr) throw upErr;
      setStep('payment');
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to save billing details.'); } finally { setBusy(false); }
  }

  // ---- Step 4: Payment → create subscription + Razorpay Checkout ----------
  async function startPayment() {
    setError(null);
    if (!selectedPlan) return setError('Pick a plan first.');
    setBusy(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('create-razorpay-subscription', {
        body: { plan_code: selectedPlan.code, billing_cycle: cycle, trial_days: 7 },
      });
      if (fnErr) throw fnErr;
      if (!data?.ok) {
        if (data?.reason === 'plan_not_configured' || data?.reason === 'not_configured') {
          setError('Payments are not fully configured yet. Your 7-day trial has started — you can add a card later from Billing.');
          setTrialEndsAt(data?.trial_ends_at ?? null);
          setStep('complete');
          return;
        }
        throw new Error(data?.details || data?.reason || 'Could not start payment.');
      }
      setTrialEndsAt(data.trial_ends_at ?? null);

      const ok = await loadRazorpay();
      if (!ok) throw new Error('Could not load the payment gateway. Check your connection.');

      const rzp = new (window as any).Razorpay({
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: 'PoultryOS',
        description: `${selectedPlan.name} — 7-day free trial, then ${cycle}`,
        theme: { color: '#7132f5' },
        handler: () => { setStep('complete'); },
        modal: { ondismiss: () => { setBusy(false); setError('Payment cancelled. Your trial is active — you can complete card setup from Billing.'); } },
        prefill: { name: billing.billing_name, email: billing.email, contact: billing.phone },
      });
      rzp.on('payment.failed', (resp: any) => setError(resp?.error?.description ?? 'Payment failed. Please try again.'));
      rzp.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment.');
    } finally { setBusy(false); }
  }

  const priceFor = (p: Plan) => (cycle === 'monthly' ? p.monthly_price_inr : p.yearly_price_inr);
  const currentIdx = STEP_TO_PROGRESS[step];

  // -------------------------------------------------------------------------
  return (
    <div className="grid gap-2xl lg:grid-cols-[260px_1fr]">
      {/* Left rail */}
      <aside className="hidden lg:block">
        <div className="card sticky top-6">
          <p className="mb-md text-xs font-semibold uppercase tracking-wide text-body-soft">Get started</p>
          <SignupProgress current={currentIdx} />
        </div>
      </aside>

      <div>
        {/* mobile compact progress */}
        <p className="mb-md text-sm font-semibold text-body lg:hidden">
          Step {currentIdx + 1} of {SIGNUP_STEPS.length} — {SIGNUP_STEPS[currentIdx]}
        </p>

        {step === 'farm' && (
          <div className="card">
            <h2 className="mb-md text-2xl font-bold text-ink">Tell us about your farm</h2>
            <div className="grid grid-cols-1 gap-md md:grid-cols-2">
              <Field label="Farm name *"><input className="input" value={farm.farm_name} onChange={(e) => fset('farm_name', e.target.value)} /></Field>
              <Field label="Owner name"><input className="input" value={farm.owner_name} onChange={(e) => fset('owner_name', e.target.value)} /></Field>
              <Field label="State *"><input className="input" value={farm.state} onChange={(e) => fset('state', e.target.value)} placeholder="Telangana" /></Field>
              <Field label="District *"><input className="input" value={farm.district} onChange={(e) => fset('district', e.target.value)} placeholder="Hyderabad" /></Field>
              <Field label="Farm phone"><PhoneInput value={farm.phone} onChange={(v) => fset('phone', v)} /></Field>
              <Field label="GSTIN"><input className="input" value={farm.gstin} onChange={(e) => fset('gstin', e.target.value)} /></Field>
            </div>
            <div className="mt-md grid grid-cols-1 gap-md md:grid-cols-2">
              <button onClick={() => fset('farm_type', 'independent')} className={`rounded-card border-2 p-md text-left ${farm.farm_type === 'independent' ? 'border-primary bg-primary-subtle' : 'border-mute'}`}>
                <p className="font-bold text-ink">Independent</p><p className="text-sm text-body">Own chicks & feed; sell to local buyers.</p>
              </button>
              <button onClick={() => fset('farm_type', 'contract')} className={`rounded-card border-2 p-md text-left ${farm.farm_type === 'contract' ? 'border-primary bg-primary-subtle' : 'border-mute'}`}>
                <p className="font-bold text-ink">Contract</p><p className="text-sm text-body">Integrator supplies chicks & feed.</p>
              </button>
            </div>
            {farm.farm_type === 'contract' && (
              <div className="mt-md">
                <Field label="Integrator *">
                  <select className="input" value={farm.integrator_id} onChange={(e) => fset('integrator_id', e.target.value)}>
                    <option value="">Select your integrator…</option>
                    {integrators.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </Field>
              </div>
            )}
            <Footer error={error} busy={busy} onNext={submitFarm} nextLabel="Continue" />
          </div>
        )}

        {step === 'plan' && (
          <div>
            <div className="mb-lg flex items-center justify-between">
              <h2 className="text-2xl font-bold text-ink">Choose a plan</h2>
              <div className="inline-flex rounded-lg bg-mute-soft p-1 text-sm font-semibold">
                <button onClick={() => setCycle('monthly')} className={`rounded-md px-md py-1.5 ${cycle === 'monthly' ? 'bg-canvas text-ink shadow-sm' : 'text-body'}`}>Monthly</button>
                <button onClick={() => setCycle('yearly')} className={`rounded-md px-md py-1.5 ${cycle === 'yearly' ? 'bg-canvas text-ink shadow-sm' : 'text-body'}`}>Yearly <span className="text-success">·2 mo free</span></button>
              </div>
            </div>
            <p className="mb-lg text-sm text-body">Every paid plan starts with a <strong>7-day free trial</strong>. Cancel anytime during the trial — you won’t be charged until day 7.</p>
            <div className="grid gap-lg md:grid-cols-3">
              {plans.map((p) => {
                const price = priceFor(p);
                const feats = Object.entries(p.features_json || {}).filter(([, v]) => v === true || (typeof v === 'number' && v > 0)).slice(0, 5);
                return (
                  <div key={p.id} className={`card flex flex-col ${p.recommended ? 'ring-2 ring-primary' : ''}`}>
                    {p.recommended && <span className="mb-sm w-fit rounded-full bg-primary-subtle px-md py-0.5 text-xs font-semibold text-primary">Most popular</span>}
                    <h3 className="text-lg font-bold text-ink">{p.name}</h3>
                    <p className="mt-sm text-2xl font-bold text-ink">
                      {p.is_contactable ? 'Custom' : Number(price) === 0 ? 'Free' : `₹${Number(price).toLocaleString('en-IN')}`}
                      {!p.is_contactable && Number(price) > 0 && <span className="text-sm font-normal text-body">/{cycle === 'monthly' ? 'mo' : 'yr'}</span>}
                    </p>
                    <ul className="mt-md flex-1 space-y-1.5 text-sm text-body">
                      {feats.map(([k, v]) => (
                        <li key={k} className="flex items-center gap-sm"><Check size={14} className="text-success" />{FEATURE_LABELS[k] ?? k}{typeof v === 'number' ? `: ${v}` : ''}</li>
                      ))}
                    </ul>
                    <button onClick={() => pickPlan(p)} disabled={busy} className={`mt-lg ${p.recommended ? 'btn-primary' : 'btn-outline'}`}>
                      {p.is_contactable ? 'Contact sales' : Number(price) === 0 ? 'Start free' : 'Start 7-day trial'}
                    </button>
                  </div>
                );
              })}
            </div>
            {error && <p className="mt-md text-sm text-danger">{error}</p>}
            <div className="mt-lg"><button onClick={() => setStep('farm')} className="btn-subtle">Back</button></div>
          </div>
        )}

        {step === 'billing' && (
          <div className="card">
            <h2 className="mb-sm text-2xl font-bold text-ink">Billing information</h2>
            <p className="mb-md text-sm text-body">Used on your tax invoices. {selectedPlan && <strong>{selectedPlan.name} · {cycle}</strong>}</p>
            <div className="grid grid-cols-1 gap-md md:grid-cols-2">
              <Field label="Billing name *"><input className="input" value={billing.billing_name} onChange={(e) => bset('billing_name', e.target.value)} /></Field>
              <Field label="Company name"><input className="input" value={billing.company_name} onChange={(e) => bset('company_name', e.target.value)} /></Field>
              <Field label="Email *"><input className="input" type="email" value={billing.email} onChange={(e) => bset('email', e.target.value)} /></Field>
              <Field label="Phone"><PhoneInput value={billing.phone} onChange={(v) => bset('phone', v)} /></Field>
              <Field label="GSTIN"><input className="input" value={billing.gstin} onChange={(e) => bset('gstin', e.target.value)} /></Field>
              <Field label="Address"><input className="input" value={billing.address_line1} onChange={(e) => bset('address_line1', e.target.value)} /></Field>
              <Field label="City"><input className="input" value={billing.city} onChange={(e) => bset('city', e.target.value)} /></Field>
              <Field label="State"><input className="input" value={billing.state} onChange={(e) => bset('state', e.target.value)} /></Field>
              <Field label="Postal code"><input className="input" value={billing.postal_code} onChange={(e) => bset('postal_code', e.target.value)} /></Field>
            </div>
            <Footer error={error} busy={busy} onBack={() => setStep('plan')} onNext={submitBilling} nextLabel="Continue to payment" />
          </div>
        )}

        {step === 'payment' && (
          <div className="card">
            <h2 className="mb-sm text-2xl font-bold text-ink">Payment</h2>
            <p className="mb-md text-sm text-body">
              We’ll securely save your payment method now. Your <strong>7-day free trial</strong> starts today —
              the first charge of <strong>₹{selectedPlan ? Number(priceFor(selectedPlan)).toLocaleString('en-IN') : ''}</strong> happens only after the trial ends, and you can cancel any time before then.
            </p>
            <div className="rounded-card border border-mute bg-canvas-soft p-md text-sm">
              <Row k="Plan" v={`${selectedPlan?.name ?? ''} (${cycle})`} />
              <Row k="Free trial" v="7 days" />
              <Row k="Then" v={`₹${selectedPlan ? Number(priceFor(selectedPlan)).toLocaleString('en-IN') : ''} / ${cycle === 'monthly' ? 'month' : 'year'}`} />
            </div>
            <Footer error={error} busy={busy} onBack={() => setStep('billing')} onNext={startPayment} nextLabel="Save card & start trial" />
          </div>
        )}

        {step === 'complete' && (
          <div className="card text-center">
            <span className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success-ink"><Check size={28} /></span>
            <h2 className="text-2xl font-bold text-ink">You’re all set!</h2>
            <p className="mx-auto mt-sm max-w-md text-body">
              {selectedPlan ? <>Your <strong>{selectedPlan.name}</strong> plan is active on a 7-day free trial.</> : 'Your account is ready.'}
              {trialEndsAt && <> First charge on <strong>{new Date(trialEndsAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>.</>}
            </p>
            <div className="mt-lg flex justify-center gap-md">
              <button onClick={() => { router.push('/'); router.refresh(); }} className="btn-primary">Go to dashboard</button>
              <button onClick={() => router.push('/billing')} className="btn-outline">View billing</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-1"><span className="text-body">{k}</span><span className="font-semibold text-ink">{v}</span></div>;
}
function Footer({ error, busy, onBack, onNext, nextLabel }: { error: string | null; busy: boolean; onBack?: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <>
      {error && <p className="mt-md text-sm text-danger">{error}</p>}
      <div className="mt-2xl flex items-center justify-between">
        {onBack ? <button onClick={onBack} disabled={busy} className="btn-subtle">Back</button> : <span />}
        <button onClick={onNext} disabled={busy} className="btn-primary inline-flex items-center gap-sm">
          {busy && <Loader2 size={16} className="animate-spin" />}{nextLabel}
        </button>
      </div>
    </>
  );
}
