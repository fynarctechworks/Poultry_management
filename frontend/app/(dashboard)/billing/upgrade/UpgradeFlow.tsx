'use client';

// =============================================================================
// Standalone subscription upgrade / change flow:  Plan → Billing → Review & Pay
// =============================================================================
//   * Plans are read from the canonical subscription_plans table (managed in the
//     SaaS Control Center) and passed in from the server page.
//   * Billing info is collected once and upserted to billing_profiles (used on
//     the Razorpay customer + tax invoices).
//   * Payment opens the IN-APP Razorpay Checkout.js modal (mandate authorize):
//       - live Razorpay sub already exists -> change-plan (prorated, no modal)
//       - otherwise                        -> create-razorpay-subscription + modal
// =============================================================================

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CheckCircle2, Loader2, CreditCard, ReceiptText } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { PhoneInput } from '@/components/PhoneInput';
import { openSubscriptionCheckout } from '@/lib/razorpay';
import { colors } from '@/lib/theme/tokens';

type Cycle = 'monthly' | 'yearly';

export interface PlanCard {
  id: string;
  code: string;
  name: string;
  tier: string | null;
  monthly_price_inr: number;
  yearly_price_inr: number;
  is_contactable: boolean;
  recommended: boolean;
  features_json: Record<string, unknown>;
}

export interface BillingProfile {
  billing_name: string | null;
  company_name: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
}

interface Props {
  plans: PlanCard[];
  currentPlanCode: string | null;
  currentCycle: Cycle;
  hasRazorpaySub: boolean;
  isTrial: boolean;
  profile: BillingProfile | null;
}

const FEATURE_LABELS: Record<string, string> = {
  vet_access: 'Vet collaboration',
  contract_farming: 'Contract farming',
  traceability_pdf: 'Traceability QR & PDF',
  multi_farm_dashboard: 'Multi-farm dashboard',
  custom_integrations: 'Custom integrations',
  sso: 'SSO',
  priority_support: 'Priority support',
  dedicated_support: 'Dedicated support',
  whatsapp_alerts_per_month: 'WhatsApp alerts/mo',
  max_buyers: 'Buyers',
};

const inr = (n: number) => '₹' + Number(n).toLocaleString('en-IN');

type Step = 'plan' | 'billing' | 'review' | 'done';
const STEPS: { key: Step; label: string }[] = [
  { key: 'plan', label: 'Plan' },
  { key: 'billing', label: 'Billing info' },
  { key: 'review', label: 'Review & pay' },
];

export function UpgradeFlow({ plans, currentPlanCode, currentCycle, hasRazorpaySub, isTrial, profile }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  // Paid, selectable plans only (free tier isn't an "upgrade").
  const payablePlans = useMemo(
    () => plans.filter((p) => p.is_contactable || p.monthly_price_inr > 0 || p.yearly_price_inr > 0),
    [plans],
  );

  const [step, setStep] = useState<Step>('plan');
  const [cycle, setCycle] = useState<Cycle>(currentCycle);
  const [selectedCode, setSelectedCode] = useState<string | null>(
    payablePlans.some((p) => p.code === currentPlanCode) ? currentPlanCode : payablePlans[0]?.code ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [form, setForm] = useState({
    billing_name: profile?.billing_name ?? '',
    company_name: profile?.company_name ?? '',
    gstin: profile?.gstin ?? '',
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
    address_line1: profile?.address_line1 ?? '',
    city: profile?.city ?? '',
    state: profile?.state ?? '',
    postal_code: profile?.postal_code ?? '',
    country: profile?.country ?? 'IN',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const selected = payablePlans.find((p) => p.code === selectedCode) ?? null;
  const priceFor = (p: PlanCard) => (cycle === 'monthly' ? p.monthly_price_inr : p.yearly_price_inr);
  const isUnchanged = selected?.code === currentPlanCode && cycle === currentCycle;

  const stepIdx = STEPS.findIndex((s) => s.key === step);

  // ---- Step 1: pick a plan ------------------------------------------------
  function choosePlan(p: PlanCard) {
    setError(null);
    if (p.is_contactable) {
      window.location.href = 'mailto:sales@poultryos.app?subject=Enterprise%20plan%20enquiry';
      return;
    }
    setSelectedCode(p.code);
    setStep('billing');
  }

  // ---- Step 2: save billing profile --------------------------------------
  async function saveBilling() {
    setError(null);
    if (!form.billing_name.trim() || !form.email.trim()) {
      setError('Billing name and email are required.');
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: tenant } = await supabase.from('tenants').select('id').eq('owner_id', user?.id ?? '').maybeSingle();
      if (!tenant) throw new Error('Could not resolve your account. Please sign in again.');
      const { error: upErr } = await supabase.from('billing_profiles').upsert(
        {
          tenant_id: tenant.id,
          billing_name: form.billing_name.trim(),
          company_name: form.company_name || null,
          gstin: form.gstin || null,
          email: form.email.trim(),
          phone: form.phone || null,
          address_line1: form.address_line1 || null,
          city: form.city || null,
          state: form.state || null,
          postal_code: form.postal_code || null,
          country: form.country || 'IN',
        },
        { onConflict: 'tenant_id' },
      );
      if (upErr) throw upErr;
      setStep('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save billing details.');
    } finally {
      setBusy(false);
    }
  }

  // ---- Step 3: pay --------------------------------------------------------
  async function pay() {
    if (!selected) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      // Live Razorpay subscription already set up -> prorated plan switch, no card.
      if (hasRazorpaySub) {
        const { data, error: fnErr } = await supabase.functions.invoke('change-plan', {
          body: { plan_code: selected.code, billing_cycle: cycle },
        });
        if (fnErr) throw fnErr;
        if (data?.ok === false || data?.error) throw new Error(data?.reason ?? data?.error ?? 'Could not change plan.');
        setStep('done');
        return;
      }

      // No mandate yet -> create subscription + open the in-app checkout modal.
      const { data, error: fnErr } = await supabase.functions.invoke('create-razorpay-subscription', {
        body: { plan_code: selected.code, billing_cycle: cycle, trial_days: isTrial ? 7 : 0 },
      });
      if (fnErr) throw fnErr;
      if (!data?.ok) {
        if (data?.reason === 'plan_not_configured' || data?.reason === 'not_configured') {
          setNotice('Card payments are not fully configured yet — your plan is recorded and you can add a card later.');
          setStep('done');
          return;
        }
        throw new Error(data?.details || data?.reason || 'Could not start payment.');
      }

      await openSubscriptionCheckout({
        keyId: data.key_id,
        subscriptionId: data.subscription_id,
        description: `${selected.name} — ${cycle}${isTrial ? ', 7-day free trial' : ''}`,
        themeColor: colors.primary,
        prefill: { name: form.billing_name, email: form.email, contact: form.phone },
        onSuccess: () => setStep('done'),
        onDismiss: () => { setBusy(false); setError('Payment was cancelled. You can resume any time from Billing.'); },
        onFailed: (msg) => { setBusy(false); setError(msg); },
      });
      // Modal is open; leave busy=true until success/dismiss handlers fire.
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start payment.');
    } finally {
      if (hasRazorpaySub) setBusy(false);
    }
  }

  // ---- Success ------------------------------------------------------------
  if (step === 'done') {
    return (
      <div className="card max-w-xl mx-auto text-center py-2xl">
        <span className="mx-auto mb-md grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success-ink">
          <Check size={28} />
        </span>
        <h2 className="text-2xl font-bold text-ink">You&apos;re all set!</h2>
        <p className="mx-auto mt-sm max-w-md text-body">
          {hasRazorpaySub
            ? <>Your plan was updated to <strong>{selected?.name}</strong> ({cycle}). The change applies on your next charge.</>
            : <>Your <strong>{selected?.name}</strong> plan is set up{isTrial ? ' on a 7-day free trial' : ''}.</>}
        </p>
        {notice && <p className="mx-auto mt-sm max-w-md text-sm text-warning-ink">{notice}</p>}
        <div className="mt-lg flex justify-center gap-md">
          <button onClick={() => { router.push('/billing'); router.refresh(); }} className="btn-primary">View billing</button>
          <button onClick={() => { router.push('/'); router.refresh(); }} className="btn-outline">Go to dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-display text-3xl text-ink mb-xs">{hasRazorpaySub ? 'Change your plan' : 'Choose your plan'}</h1>
      <p className="text-sm text-body mb-xl">
        {hasRazorpaySub
          ? 'Switch plans any time. Changes are prorated on your next charge.'
          : 'Pick a plan, confirm your billing details and complete a secure payment — without leaving the app.'}
      </p>

      {/* Stepper */}
      <ol className="flex items-center gap-sm mb-2xl text-sm">
        {STEPS.map((s, i) => {
          const done = i < stepIdx;
          const active = i === stepIdx;
          return (
            <li key={s.key} className="flex items-center gap-sm">
              <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                active ? 'bg-primary text-on-primary' : done ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'
              }`}>
                {done ? <Check size={14} /> : i + 1}
              </span>
              <span className={`font-semibold ${active ? 'text-ink' : 'text-body'}`}>{s.label}</span>
              {i < STEPS.length - 1 && <span className="mx-xs h-px w-8 bg-mute" />}
            </li>
          );
        })}
      </ol>

      {/* ---- Plan step ---- */}
      {step === 'plan' && (
        <div>
          <div className="mb-lg flex items-center justify-end">
            <div className="inline-flex rounded-lg bg-mute-soft p-1 text-sm font-semibold" role="radiogroup" aria-label="Billing cycle">
              <button role="radio" aria-checked={cycle === 'monthly'} onClick={() => setCycle('monthly')}
                className={`rounded-md px-md py-1.5 ${cycle === 'monthly' ? 'bg-canvas text-ink shadow-sm' : 'text-body'}`}>Monthly</button>
              <button role="radio" aria-checked={cycle === 'yearly'} onClick={() => setCycle('yearly')}
                className={`rounded-md px-md py-1.5 ${cycle === 'yearly' ? 'bg-canvas text-ink shadow-sm' : 'text-body'}`}>
                Yearly <span className="text-success">· 2 mo free</span>
              </button>
            </div>
          </div>

          {payablePlans.length === 0 ? (
            <div className="card text-center text-body py-2xl">No plans are available right now. Please check back soon.</div>
          ) : (
            <div className="grid gap-lg md:grid-cols-3">
              {payablePlans.map((p) => {
                const price = priceFor(p);
                const isCurrent = p.code === currentPlanCode;
                const feats = Object.entries(p.features_json || {})
                  .filter(([, v]) => v === true || (typeof v === 'number' && v > 0))
                  .slice(0, 6);
                return (
                  <div key={p.id} className={`card flex flex-col ${p.recommended ? 'ring-2 ring-primary' : ''}`}>
                    <div className="flex items-center justify-between">
                      {p.recommended
                        ? <span className="w-fit rounded-full bg-primary-subtle px-md py-0.5 text-xs font-semibold text-primary">Most popular</span>
                        : <span />}
                      {isCurrent && <span className="rounded-sm bg-success-soft px-xs py-xxs text-xs font-semibold text-success-ink">Current</span>}
                    </div>
                    <h3 className="mt-sm text-lg font-bold text-ink">{p.name}</h3>
                    <p className="mt-xs font-display text-3xl text-ink">
                      {p.is_contactable ? 'Custom' : inr(price)}
                      {!p.is_contactable && <span className="text-sm font-normal text-body">/{cycle === 'monthly' ? 'mo' : 'yr'}</span>}
                    </p>
                    <ul className="mt-md flex-1 space-y-1.5 text-sm text-body">
                      {feats.map(([k, v]) => (
                        <li key={k} className="flex items-center gap-sm">
                          <Check size={14} className="text-success shrink-0" />
                          {FEATURE_LABELS[k] ?? k}{typeof v === 'number' ? `: ${v}` : ''}
                        </li>
                      ))}
                    </ul>
                    <button onClick={() => choosePlan(p)} className={`mt-lg ${p.recommended ? 'btn-primary' : 'btn-outline'}`}>
                      {p.is_contactable ? 'Contact sales' : isCurrent ? 'Keep / change cycle' : 'Select plan'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="mt-md text-sm text-danger">{error}</p>}
        </div>
      )}

      {/* ---- Billing step ---- */}
      {step === 'billing' && (
        <div className="max-w-2xl">
          <div className="mb-lg flex items-center gap-sm text-body">
            <ReceiptText size={18} className="text-primary" />
            <p className="text-sm">Used on your GST tax invoices. {selected && <strong className="text-ink">{selected.name} · {cycle}</strong>}</p>
          </div>
          <div className="grid grid-cols-1 gap-md md:grid-cols-2">
            <Field label="Billing name *"><input className="input" value={form.billing_name} onChange={(e) => set('billing_name', e.target.value)} placeholder="Name on the invoice" /></Field>
            <Field label="Company name"><input className="input" value={form.company_name} onChange={(e) => set('company_name', e.target.value)} placeholder="Optional" /></Field>
            <Field label="Email *"><input className="input" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@example.com" /></Field>
            <Field label="Phone"><PhoneInput value={form.phone} onChange={(v) => set('phone', v)} /></Field>
            <Field label="GSTIN"><input className="input" value={form.gstin} onChange={(e) => set('gstin', e.target.value)} placeholder="Optional — for input credit" /></Field>
            <Field label="Address"><input className="input" value={form.address_line1} onChange={(e) => set('address_line1', e.target.value)} placeholder="House / street / area" /></Field>
            <Field label="City"><input className="input" value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. Hyderabad" /></Field>
            <Field label="State"><input className="input" value={form.state} onChange={(e) => set('state', e.target.value)} placeholder="e.g. Andhra Pradesh" /></Field>
            <Field label="Postal code"><input className="input" value={form.postal_code} onChange={(e) => set('postal_code', e.target.value)} placeholder="6-digit PIN code" /></Field>
          </div>
          {error && <p className="mt-md text-sm text-danger">{error}</p>}
          <div className="mt-xl flex items-center gap-md">
            <button onClick={() => { setError(null); setStep('plan'); }} className="btn-subtle">Back</button>
            <button onClick={saveBilling} disabled={busy} className="btn-primary inline-flex items-center gap-sm">
              {busy && <Loader2 size={16} className="animate-spin" />} Continue to payment
            </button>
          </div>
        </div>
      )}

      {/* ---- Review step ---- */}
      {step === 'review' && selected && (
        <div className="max-w-xl">
          <div className="card">
            <h2 className="text-lg font-bold text-ink mb-md flex items-center gap-sm"><CreditCard size={18} className="text-primary" /> Order summary</h2>
            <Row k="Plan" v={`${selected.name} (${cycle})`} />
            {!hasRazorpaySub && isTrial && <Row k="Free trial" v="7 days" />}
            <Row k={!hasRazorpaySub && isTrial ? 'Then' : 'Amount'} v={`${inr(priceFor(selected))} / ${cycle === 'monthly' ? 'month' : 'year'}`} />
            <div className="mt-md border-t border-mute pt-md text-sm text-body">
              {hasRazorpaySub
                ? 'Your card on file stays the same. The new plan is prorated on your next charge.'
                : isTrial
                  ? 'We securely authorise your payment method now. The first charge happens only after the 7-day trial — cancel any time before then.'
                  : 'We securely authorise your payment method and the first charge happens now.'}
            </div>
          </div>
          {error && <p className="mt-md text-sm text-danger">{error}</p>}
          {notice && <p className="mt-md text-sm text-warning-ink">{notice}</p>}
          <div className="mt-xl flex items-center gap-md">
            <button onClick={() => { setError(null); setStep('billing'); }} className="btn-subtle" disabled={busy}>Back</button>
            <button onClick={pay} disabled={busy || isUnchanged} className="btn-primary inline-flex items-center gap-sm">
              {busy && <Loader2 size={16} className="animate-spin" />}
              {hasRazorpaySub ? 'Confirm plan change' : isTrial ? 'Save card & start trial' : 'Pay now'}
            </button>
          </div>
          {isUnchanged && <p className="mt-sm text-xs text-body">This is already your current plan and cycle.</p>}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>;
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between py-1"><span className="text-body">{k}</span><span className="font-semibold text-ink">{v}</span></div>;
}
