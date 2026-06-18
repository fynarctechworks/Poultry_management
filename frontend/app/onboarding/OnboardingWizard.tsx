'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, CreditCard, Handshake, Loader2, Lock, Warehouse } from '@/components/icons';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PhoneInput } from '@/components/PhoneInput';
import { isValidPhone, parsePhone } from '@/lib/constants/countries';
import { Country, State, City } from 'country-state-city';
import { SignupProgress, SIGNUP_STEPS, type SignupStepIndex } from '@/components/signup/SignupProgress';
import { PaymentReceipt, type ReceiptData } from './PaymentReceipt';
import { openSubscriptionCheckout } from '@/lib/razorpay';
import { colors } from '@/lib/theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type StepKey = 'farm' | 'farmType' | 'plan' | 'billing' | 'complete';
const STEP_TO_PROGRESS: Record<StepKey, SignupStepIndex> = {
  farm: 2, farmType: 3, plan: 4, billing: 5, complete: 6,
};

interface Plan {
  id: string; code: string; name: string; tier: string;
  monthly_price_inr: number; yearly_price_inr: number;
  is_contactable: boolean; recommended: boolean; features_json: Record<string, unknown>;
}

interface FarmForm {
  farm_name: string; owner_name: string; country: string; state: string; district: string; address: string;
  phone: string; gstin: string; farm_type: 'independent' | 'contract'; integrator_id: string; upi_id: string;
  whatsapp_phone: string; whatsapp_opt_in: boolean;
  // Location powers weather + heat-stress alerts. Optional, but without it those
  // alerts never fire (mobile captures this in its onboarding step-4; web must too).
  latitude: string; longitude: string; heat_stress_threshold_celsius: string;
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

// ---------------------------------------------------------------------------
export function OnboardingWizard() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [step, setStep] = useState<StepKey>('farm');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const [integrators, setIntegrators] = useState<Integrator[]>([]);
  const [farm, setFarm] = useState<FarmForm>({
    farm_name: '', owner_name: '', country: 'IN', state: '', district: '', address: '', phone: '', gstin: '',
    farm_type: 'independent', integrator_id: '', upi_id: '', whatsapp_phone: '', whatsapp_opt_in: true,
    latitude: '', longitude: '', heat_stress_threshold_celsius: '35',
  });
  const [locating, setLocating] = useState(false);
  const [locationNote, setLocationNote] = useState<string | null>(null);
  // ISO code of the selected state — needed to look up its cities. The farm form
  // itself stores the human-readable state/city names.
  const [stateIso, setStateIso] = useState('');
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

  // Browser geolocation → fills lat/long so weather + heat-stress alerts can run.
  // Best-effort: permission denial or no support just leaves the manual inputs.
  function useMyLocation() {
    setLocationNote(null);
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationNote('Location not supported on this device — enter it manually below.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFarm((f) => ({
          ...f,
          latitude: pos.coords.latitude.toFixed(6),
          longitude: pos.coords.longitude.toFixed(6),
        }));
        setLocating(false);
        setLocationNote('Location captured — weather & heat-stress alerts will use it.');
      },
      () => {
        setLocating(false);
        setLocationNote('Could not get your location — allow permission or enter it manually.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  // ---- Step 1a: Farm details → validate, then advance to farm-type --------
  function goToFarmType() {
    setError(null);
    if (!farm.farm_name || !farm.state || !farm.district) return setError('Farm name, state, and district are required.');
    if (farm.phone) { const { country, national } = parsePhone(farm.phone); if (!isValidPhone(country, national)) return setError(`Enter a valid ${country.name} phone number.`); }
    if (farm.latitude && (Number.isNaN(Number(farm.latitude)) || Math.abs(Number(farm.latitude)) > 90)) return setError('Latitude must be between -90 and 90.');
    if (farm.longitude && (Number.isNaN(Number(farm.longitude)) || Math.abs(Number(farm.longitude)) > 180)) return setError('Longitude must be between -180 and 180.');
    setStep('farmType');
  }

  // ---- Step 1b: Farm type → create tenant + farm via atomic RPC -----------
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
            country: farm.country || 'IN',
            whatsapp_phone: farm.whatsapp_phone || null,
            whatsapp_opt_in: farm.whatsapp_opt_in,
            farm: {
              farm_name: farm.farm_name, owner_name: farm.owner_name || null,
              state: farm.state, district: farm.district, address: farm.address || null,
              phone: farm.phone || null,
              gstin: farm.gstin || null, farm_type: farm.farm_type,
              integrator_id: farm.farm_type === 'contract' ? farm.integrator_id : null,
              upi_id: farm.upi_id || null,
              latitude: farm.latitude || null,
              longitude: farm.longitude || null,
              heat_stress_threshold_celsius: farm.heat_stress_threshold_celsius || null,
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


  // Build the success receipt for the Complete step. The plan price is the actual
  // amount Razorpay charges, so GST (18%) is shown INCLUSIVE — total == plan price,
  // never plan + GST. The first real charge fires after the 7-day trial.
  function buildReceipt(plan: Plan, method: string, firstChargeISO: string) {
    const total = Number(priceFor(plan));
    const subtotal = Math.round((total / 1.18) * 100) / 100;
    const tax = Math.round((total - subtotal) * 100) / 100;
    setReceipt({
      invoiceNumber: `INV-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
      orderTimeISO: new Date().toISOString(),
      method,
      billingName: billing.billing_name,
      planName: plan.name,
      cycle,
      subtotal,
      tax,
      total,
      firstChargeISO,
    });
  }

  // Mandatory billing → upsert profile, then create a real Razorpay subscription
  // (card-upfront, 7-day trial) and open the in-app Razorpay Checkout modal. The
  // first charge auto-fires on day 7; the razorpay-webhook flips status to active.
  async function payNow() {
    setError(null);
    setNotice(null);
    const required: [keyof BillingForm, string][] = [
      ['billing_name', 'Billing name'], ['email', 'Email'], ['phone', 'Phone'],
      ['address_line1', 'Address'], ['city', 'City'], ['state', 'State'], ['postal_code', 'Postal code'],
    ];
    for (const [k, label] of required) if (!String(billing[k] ?? '').trim()) return setError(`${label} is required.`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billing.email)) return setError('Enter a valid email address.');

    if (!tenantId) return setError('Missing tenant. Please restart.');
    if (!selectedPlan) return setError('Pick a plan first.');

    setBusy(true);
    try {
      // 1. Persist the billing profile — the Razorpay customer is built from it.
      const { error: upErr } = await supabase.from('billing_profiles').upsert({
        tenant_id: tenantId, billing_name: billing.billing_name, company_name: billing.company_name || null,
        gstin: billing.gstin || null, email: billing.email, phone: billing.phone || null,
        address_line1: billing.address_line1 || null, city: billing.city || null,
        state: billing.state || null, postal_code: billing.postal_code || null, country: billing.country || 'IN',
      }, { onConflict: 'tenant_id' });
      if (upErr) throw upErr;

      // 2. Create the Razorpay subscription (server-side; uses the test keys set
      //    as edge-function secrets). It also attaches the trial to the tenant.
      const { data, error: fnErr } = await supabase.functions.invoke('create-razorpay-subscription', {
        body: { plan_code: selectedPlan.code, billing_cycle: cycle, trial_days: 7 },
      });
      if (fnErr) throw fnErr;

      // Gateway not configured yet -> record the plan and finish gracefully.
      if (!data?.ok) {
        if (data?.reason === 'plan_not_configured' || data?.reason === 'not_configured') {
          await supabase.from('tenant_subscriptions')
            .update({ plan_id: selectedPlan.id, billing_cycle: cycle })
            .eq('tenant_id', tenantId);
          const ends = new Date(Date.now() + 7 * 86400000).toISOString();
          setTrialEndsAt(ends);
          setNotice('Card payments are not fully configured yet — your plan is recorded and you can add a card later from Billing.');
          setBusy(false);
          setStep('complete');
          return;
        }
        throw new Error(data?.details || data?.reason || 'Could not start payment.');
      }

      // 3. Open the in-app Razorpay Checkout modal to authorize the mandate.
      const ends: string = data.trial_ends_at ?? new Date(Date.now() + 7 * 86400000).toISOString();
      const plan = selectedPlan;
      await openSubscriptionCheckout({
        keyId: data.key_id,
        subscriptionId: data.subscription_id,
        description: `${plan.name} — ${cycle}, 7-day free trial`,
        themeColor: colors.primary,
        prefill: { name: billing.billing_name, email: billing.email, contact: billing.phone },
        onSuccess: (resp) => {
          buildReceipt(plan, resp.razorpay_payment_id ? `Razorpay · ${resp.razorpay_payment_id}` : 'Razorpay subscription', ends);
          setTrialEndsAt(ends);
          setBusy(false);
          setStep('complete');
        },
        onDismiss: () => { setBusy(false); setError('Payment was cancelled. You can try again any time.'); },
        onFailed: (msg) => { setBusy(false); setError(msg); },
      });
      // Modal is open; keep busy=true until a handler above fires.
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Payment could not be completed.');
      setBusy(false);
    }
  }

  const priceFor = (p: Plan) => (cycle === 'monthly' ? p.monthly_price_inr : p.yearly_price_inr);
  // Order-summary amounts. The plan price is what Razorpay actually charges, so GST
  // (18%) is shown INCLUSIVE — base + GST == plan price, never plan + GST.
  const inr2 = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const billTotal = selectedPlan ? Number(priceFor(selectedPlan)) : 0;
  const billBase = Math.round((billTotal / 1.18) * 100) / 100;
  const billGst = Math.round((billTotal - billBase) * 100) / 100;
  const billPer = cycle === 'monthly' ? 'month' : 'year';
  const currentIdx = STEP_TO_PROGRESS[step];
  // The plan, billing/payment + complete steps need room — go full-width (hide the rail).
  const isWide = step === 'plan' || step === 'billing' || step === 'complete';

  // Global location cascade (country → state → city) + integrator ordering.
  const countries = useMemo(() => Country.getAllCountries(), []);
  const states = useMemo(() => State.getStatesOfCountry(farm.country) ?? [], [farm.country]);
  const cities = useMemo(
    () => (stateIso ? City.getCitiesOfState(farm.country, stateIso) ?? [] : []),
    [farm.country, stateIso],
  );
  const sortedIntegrators = useMemo(
    () => [...integrators].sort((a, b) => Number(a.name === 'Other') - Number(b.name === 'Other') || a.name.localeCompare(b.name)),
    [integrators],
  );

  // -------------------------------------------------------------------------
  return (
    <>
      {/* Left brand panel — atmospheric orb backdrop with the signup step rail.
          Mirrors the (auth) layout's AuthBrandPanel visual language.
          Hidden below lg; also hidden on the wide plan/billing/complete steps. */}
      <aside className={`relative m-3 hidden w-[44%] flex-col justify-between overflow-hidden rounded-card bg-surface-dark p-10 text-on-dark xl:w-1/2 xl:p-12 ${isWide ? 'lg:hidden' : 'lg:flex'}`}>
        {/* Atmospheric orb — mint bloom top-right */}
        <div aria-hidden className="orb-mint pointer-events-none absolute -right-24 -top-24 h-[420px] w-[420px] opacity-20 blur-3xl" />
        {/* Atmospheric orb — peach bloom bottom-left */}
        <div aria-hidden className="orb-peach pointer-events-none absolute -bottom-24 -left-16 h-[360px] w-[360px] opacity-15 blur-3xl" />
        {/* Faint sky mid accent */}
        <div aria-hidden className="orb-sky pointer-events-none absolute right-1/3 top-1/2 h-[240px] w-[240px] -translate-y-1/2 opacity-10 blur-2xl" />

        <div className="relative z-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/poultry-logo-white.png" alt="PoultryOS" className="h-10 w-auto" />
        </div>

        <div className="relative z-10">
          <p className="mb-md text-sm font-medium uppercase tracking-widest text-on-dark-soft">Get started</p>
          <SignupProgress current={currentIdx} variant="dark" />
        </div>
      </aside>

      {/* Form column */}
      <section className="flex flex-1 items-start justify-center overflow-y-auto px-6 py-10 sm:px-10">
        <div className={`w-full ${isWide ? 'max-w-6xl' : 'max-w-2xl'}`}>
          {/* Compact logo for mobile (panel is hidden) */}
          <div className="mb-xl lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/poultry-logo-color.png" alt="PoultryOS" className="h-9 w-auto" />
          </div>

          {/* compact progress — always on mobile; also on the full-width plan step */}
          <p className={`mb-md text-sm font-semibold text-body ${isWide ? '' : 'lg:hidden'}`}>
            Step {currentIdx + 1} of {SIGNUP_STEPS.length} — {SIGNUP_STEPS[currentIdx]}
          </p>

          {step === 'farm' && (
          <div>
            <h2 className="font-display text-3xl leading-tight text-ink">Tell us about your farm</h2>
            <p className="mb-lg mt-2 text-sm text-body">This sets up your dashboard, weather alerts and reports. You can change any of it later in Settings.</p>

            <div className="grid grid-cols-1 gap-md md:grid-cols-2">
              <Field label="Farm name *"><input className="input" value={farm.farm_name} onChange={(e) => fset('farm_name', e.target.value)} placeholder="e.g. Sri Lakshmi Poultry Farm" /></Field>
              <Field label="Owner name"><input className="input" value={farm.owner_name} onChange={(e) => fset('owner_name', e.target.value)} placeholder="e.g. Ramesh Kumar" /></Field>

              <Field label="Country *">
                <select className="input" value={farm.country}
                  onChange={(e) => { setStateIso(''); setFarm((f) => ({ ...f, country: e.target.value, state: '', district: '' })); }}>
                  {countries.map((c) => <option key={c.isoCode} value={c.isoCode}>{c.flag} {c.name}</option>)}
                </select>
              </Field>
              <Field label="Farm phone"><PhoneInput value={farm.phone} onChange={(v) => fset('phone', v)} /></Field>

              <Field label="State / Province *">
                {states.length > 0 ? (
                  <select className="input" value={stateIso}
                    onChange={(e) => {
                      const iso = e.target.value;
                      const st = states.find((s) => s.isoCode === iso);
                      setStateIso(iso);
                      setFarm((f) => ({ ...f, state: st?.name ?? '', district: '' }));
                    }}>
                    <option value="">Select state / province…</option>
                    {states.map((s) => <option key={s.isoCode} value={s.isoCode}>{s.name}</option>)}
                  </select>
                ) : (
                  <input className="input" value={farm.state} placeholder="State / Province" onChange={(e) => fset('state', e.target.value)} />
                )}
              </Field>
              <Field label="District / City *">
                {cities.length > 0 ? (
                  <>
                    <input className="input" list="farm-city-list" value={farm.district}
                      placeholder={stateIso ? 'Start typing your city / district' : 'Select a state first'}
                      onChange={(e) => fset('district', e.target.value)} />
                    <datalist id="farm-city-list">{cities.map((c) => <option key={`${c.name}-${c.latitude ?? ''}`} value={c.name} />)}</datalist>
                  </>
                ) : (
                  <input className="input" value={farm.district}
                    placeholder={states.length > 0 && !stateIso ? 'Select a state first' : 'District / City'}
                    onChange={(e) => fset('district', e.target.value)} />
                )}
              </Field>

              <div className="md:col-span-2">
                <Field label="Farm address"><input className="input" value={farm.address} onChange={(e) => fset('address', e.target.value)} placeholder="Village / street / landmark (optional)" /></Field>
              </div>
              <div className="md:col-span-2">
                <Field label="GSTIN"><input className="input" value={farm.gstin} onChange={(e) => fset('gstin', e.target.value)} placeholder="15-digit GSTIN (optional)" /></Field>
              </div>
            </div>

            {/* Location → powers weather + heat-stress alerts. Optional but recommended;
                without coordinates those alerts can never fire for this farm. */}
            <div className="mt-lg rounded-card border border-mute bg-canvas-soft p-md">
              <div className="flex flex-wrap items-center justify-between gap-sm">
                <div>
                  <p className="text-sm font-semibold text-ink">Farm location <span className="font-normal text-body">— for weather &amp; heat-stress alerts</span></p>
                  <p className="text-xs text-body">Recommended. We use it to forecast heat stress for your sheds. You can set it later in Settings.</p>
                </div>
                <button type="button" onClick={useMyLocation} disabled={locating} className="btn-outline gap-sm whitespace-nowrap">
                  {locating && <Loader2 size={14} className="animate-spin" />}
                  {locating ? 'Locating…' : 'Use my location'}
                </button>
              </div>
              <div className="mt-md grid grid-cols-1 gap-md sm:grid-cols-3">
                <Field label="Latitude"><input className="input" inputMode="decimal" value={farm.latitude} onChange={(e) => fset('latitude', e.target.value)} placeholder="e.g. 17.6868" /></Field>
                <Field label="Longitude"><input className="input" inputMode="decimal" value={farm.longitude} onChange={(e) => fset('longitude', e.target.value)} placeholder="e.g. 83.2185" /></Field>
                <Field label="Heat-stress threshold (°C)"><input className="input" inputMode="decimal" value={farm.heat_stress_threshold_celsius} onChange={(e) => fset('heat_stress_threshold_celsius', e.target.value)} placeholder="35" /></Field>
              </div>
              {locationNote && <p className="mt-sm text-xs text-body">{locationNote}</p>}
            </div>

            <Footer error={error} busy={busy} onNext={goToFarmType} nextLabel="Continue" />
          </div>
        )}

        {step === 'farmType' && (
          <div>
            <h2 className="font-display text-3xl leading-tight text-ink">How do you run your farm?</h2>
            <p className="mb-lg mt-2 text-sm text-body">Pick the one that matches how you get chicks &amp; feed — it decides whether we set up buyer khata or contract settlement tracking.</p>

            <div className="grid grid-cols-1 gap-md md:grid-cols-2">
              <FarmTypeCard
                active={farm.farm_type === 'independent'}
                icon={<Warehouse size={18} />}
                title="Independent"
                desc="I buy my own chicks &amp; feed and sell birds to local buyers or traders."
                onClick={() => fset('farm_type', 'independent')}
              />
              <FarmTypeCard
                active={farm.farm_type === 'contract'}
                icon={<Handshake size={18} />}
                title="Contract"
                desc="A company (integrator) supplies chicks &amp; feed; I grow them for a fee."
                onClick={() => fset('farm_type', 'contract')}
              />
            </div>

            {farm.farm_type === 'contract' && (
              <div className="mt-md rounded-card border border-mute bg-canvas-soft p-md">
                <Field label="Which company is your integrator? *">
                  <select className="input" value={farm.integrator_id} onChange={(e) => fset('integrator_id', e.target.value)}>
                    <option value="">Select the company that supplies your chicks &amp; feed…</option>
                    {sortedIntegrators.map((i) => (
                      <option key={i.id} value={i.id}>{i.name === 'Other' ? 'Other / My company isn’t listed' : i.name}</option>
                    ))}
                  </select>
                </Field>
                <p className="mt-sm text-xs text-body">
                  These are India’s major poultry integrators. Choose <strong>Other</strong> if yours isn’t shown — you can rename it later in Settings.
                </p>
              </div>
            )}

            <Footer error={error} busy={busy} onBack={() => setStep('farm')} onNext={submitFarm} nextLabel="Continue" />
          </div>
        )}

        {step === 'plan' && (
          <div>
            <div className="mb-lg flex items-center justify-between">
              <h2 className="font-display text-3xl leading-tight text-ink">Choose a plan</h2>
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
            <div className="mt-lg"><button onClick={() => setStep('farmType')} className="btn-subtle">Back</button></div>
          </div>
        )}

        {step === 'billing' && (
          <div>
            <div className="mb-lg">
              <h2 className="font-display text-3xl leading-tight text-ink">Billing &amp; payment</h2>
              <p className="mt-1 text-sm text-body">
                Fill in your billing details and card to start your <strong>7-day free trial</strong>. The first charge happens only after the trial — cancel any time before then.
              </p>
            </div>

            <div className="grid gap-xl lg:grid-cols-5">
              {/* Billing information (mandatory) */}
              <div className="lg:col-span-3">
                <h3 className="mb-md text-xs font-bold uppercase tracking-wide text-body-soft">Billing information</h3>
                <div className="grid grid-cols-1 gap-md sm:grid-cols-2">
                  <Field label="Billing name *"><input className="input" value={billing.billing_name} onChange={(e) => bset('billing_name', e.target.value)} placeholder="Name on the invoice" /></Field>
                  <Field label="Company name"><input className="input" value={billing.company_name} onChange={(e) => bset('company_name', e.target.value)} placeholder="Optional" /></Field>
                  <Field label="Email *"><input className="input" type="email" value={billing.email} onChange={(e) => bset('email', e.target.value)} placeholder="you@example.com" /></Field>
                  <Field label="Phone *"><PhoneInput value={billing.phone} onChange={(v) => bset('phone', v)} /></Field>
                  <Field label="GSTIN"><input className="input" value={billing.gstin} onChange={(e) => bset('gstin', e.target.value)} placeholder="15-digit GSTIN (optional)" /></Field>
                  <Field label="Address *"><input className="input" value={billing.address_line1} onChange={(e) => bset('address_line1', e.target.value)} placeholder="House / street / area" /></Field>
                  <Field label="City *"><input className="input" value={billing.city} onChange={(e) => bset('city', e.target.value)} placeholder="e.g. Hyderabad" /></Field>
                  <Field label="State *"><input className="input" value={billing.state} onChange={(e) => bset('state', e.target.value)} placeholder="e.g. Andhra Pradesh" /></Field>
                  <Field label="Postal code *"><input className="input" value={billing.postal_code} onChange={(e) => bset('postal_code', e.target.value)} placeholder="6-digit PIN code" /></Field>
                </div>
              </div>

              {/* Order summary + secure Razorpay checkout */}
              <div className="lg:col-span-2">
                <div className="card lg:sticky lg:top-6">
                  <h3 className="mb-md text-xs font-bold uppercase tracking-wide text-body-soft">Order summary</h3>
                  <Row k="Plan" v={`${selectedPlan?.name ?? ''} (${cycle})`} />
                  <Row k="Free trial" v="7 days" />
                  <Row k="Base price" v={selectedPlan ? `₹${inr2(billBase)}` : '—'} />
                  <Row k="GST (18%)" v={selectedPlan ? `₹${inr2(billGst)}` : '—'} />
                  <div className="my-sm border-t border-mute" />
                  <Row k={`Then / ${billPer}`} v={selectedPlan ? `₹${inr2(billTotal)} (incl. GST)` : '—'} />

                  <div className="my-md border-t border-mute" />

                  <h3 className="mb-sm flex items-center gap-sm text-xs font-bold uppercase tracking-wide text-body-soft">
                    <CreditCard size={14} /> Payment
                  </h3>
                  <p className="text-sm text-body">
                    Continue to securely save your card with <strong className="text-ink">Razorpay</strong>. The first charge happens only after the 7-day trial — cancel any time before then.
                  </p>
                  <p className="mt-md rounded-md bg-warning-soft px-sm py-xs text-xs text-warning-ink">
                    Test mode — use card <strong>4111 1111 1111 1111</strong>, any future expiry, any CVV.
                  </p>

                  {error && <p className="mt-md text-sm text-danger">{error}</p>}

                  <button onClick={payNow} disabled={busy} className="btn-primary mt-lg w-full gap-sm">
                    {busy && <Loader2 size={16} className="animate-spin" />}
                    Pay ₹{selectedPlan ? Number(priceFor(selectedPlan)).toLocaleString('en-IN') : ''} &amp; start trial
                  </button>
                  <button onClick={() => { setError(null); setStep('plan'); }} disabled={busy} className="btn-subtle mt-sm w-full">Back</button>
                  <p className="mt-md flex items-center justify-center gap-xs text-xs text-body-soft">
                    <Lock size={12} /> Payments are secured &amp; encrypted by Razorpay
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center">
            <span className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success-ink"><Check size={28} /></span>
            <h2 className="font-display text-4xl leading-tight text-ink">You’re all set!</h2>
            <p className="mx-auto mt-sm max-w-md text-body">
              {selectedPlan ? <>Your <strong>{selectedPlan.name}</strong> plan is active on a 7-day free trial.</> : 'Your account is ready.'}
              {trialEndsAt && <> First charge on <strong>{new Date(trialEndsAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</strong>.</>}
            </p>
            {notice && <p className="mx-auto mt-sm max-w-md text-sm text-warning-ink">{notice}</p>}

            {receipt && <div className="mt-xl"><PaymentReceipt data={receipt} /></div>}

            <div className="mt-xl flex justify-center gap-md">
              <button onClick={() => { router.push('/'); router.refresh(); }} className="btn-primary">Go to dashboard</button>
            </div>
          </div>
        )}
        </div>
      </section>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
function FarmTypeCard({ active, icon, title, desc, onClick }: {
  active: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'relative flex items-start gap-md rounded-card border-2 p-md text-left transition',
        active ? 'border-primary bg-primary-subtle' : 'border-mute hover:border-primary/40',
      ].join(' ')}
    >
      <span className={['mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg', active ? 'bg-primary text-on-primary' : 'bg-mute-soft text-body'].join(' ')}>
        {icon}
      </span>
      <span className="pr-6">
        <span className="block font-bold text-ink">{title}</span>
        <span className="block text-sm text-body">{desc}</span>
      </span>
      {active && <CheckCircle2 size={18} className="absolute right-3 top-3 text-primary" />}
    </button>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-1"><span className="text-body">{k}</span><span className="font-semibold text-ink">{v}</span></div>;
}
function Footer({ error, busy, onBack, onNext, nextLabel }: { error: string | null; busy: boolean; onBack?: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <>
      {error && <p className="mt-md text-sm text-danger">{error}</p>}
      <div className="mt-2xl flex flex-col gap-sm">
        <button onClick={onNext} disabled={busy} className="btn-primary w-full gap-sm">
          {busy && <Loader2 size={16} className="animate-spin" />}{nextLabel}
        </button>
        {onBack && <button onClick={onBack} disabled={busy} className="btn-subtle w-full">Back</button>}
      </div>
    </>
  );
}
