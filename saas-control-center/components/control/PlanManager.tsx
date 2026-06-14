'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Plus, Power, Archive, Copy, Check, ArrowRight } from 'lucide-react';
import { createPlan, setPlanActive, duplicatePlan } from '@/lib/control/plans';

export interface PlanListItem {
  id: string;
  code: string;
  name: string;
  tier: string | null;
  monthly_price_inr: number | null;
  yearly_price_inr: number | null;
  max_farms: number | null;
  max_users: number | null;
  is_active: boolean;
  recommended: boolean | null;
  is_contactable: boolean | null;
  features_json: Record<string, unknown> | null;
}

export interface FeatureCatalogItem {
  code: string;
  name: string;
  value_type: string;
  category: string;
  sort_order: number;
}

const rupee = (n: number | null | undefined) => `₹${(n ?? 0).toLocaleString('en-IN')}`;

/** Human-readable list of what a plan includes, derived from features_json + catalog. */
function summarize(plan: PlanListItem, features: FeatureCatalogItem[]): string[] {
  const fj = plan.features_json ?? {};
  const out: string[] = [];
  for (const f of features) {
    const v = fj[f.code];
    if (f.value_type === 'boolean') {
      if (v === true) out.push(f.name);
    } else if (f.value_type === 'numeric') {
      if (v === null) out.push(`${f.name}: Unlimited`);
      else if (v !== undefined) out.push(`${f.name}: ${Number(v).toLocaleString('en-IN')}`);
    } else if (v !== undefined && v !== null && v !== '') {
      out.push(`${f.name}: ${String(v)}`);
    }
  }
  return out;
}

export function PlanManager({
  plans,
  features,
  canManage,
}: {
  plans: PlanListItem[];
  features: FeatureCatalogItem[];
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    code: '', name: '', tier: 'custom', monthly_price_inr: '', yearly_price_inr: '',
    max_farms: '', max_users: '',
  });

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: 'Done.' } : { ok: false, text: r.error ?? 'Failed.' });
      if (r.ok) setShowCreate(false);
    });
  }

  const footBtn =
    'inline-flex items-center justify-center gap-xs h-8 px-sm rounded-md text-xs font-semibold border border-mute text-body hover:bg-mute-soft disabled:opacity-50';

  return (
    <div>
      {canManage && (
        <div className="mb-xl">
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="inline-flex items-center gap-sm h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark"
          >
            <Plus size={16} /> New plan
          </button>

          {showCreate && (
            <div className="mt-md bg-canvas border border-mute rounded-card p-lg grid grid-cols-2 md:grid-cols-4 gap-md">
              {([
                ['code', 'Code'], ['name', 'Name'], ['tier', 'Tier'],
                ['monthly_price_inr', 'Monthly ₹'], ['yearly_price_inr', 'Yearly ₹'],
                ['max_farms', 'Max farms (blank = ∞)'], ['max_users', 'Max users (blank = ∞)'],
              ] as const).map(([k, label]) => (
                <label key={k} className="text-xs">
                  <span className="block font-semibold text-body mb-xxs">{label}</span>
                  <input
                    value={(form as any)[k]}
                    onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="h-9 w-full px-sm rounded-lg border border-mute bg-canvas text-sm text-ink"
                  />
                </label>
              ))}
              <div className="flex items-end">
                <button
                  disabled={pending}
                  onClick={() => act(() => createPlan({
                    code: form.code, name: form.name, tier: form.tier,
                    monthly_price_inr: form.monthly_price_inr || 0,
                    yearly_price_inr: form.yearly_price_inr || 0,
                    max_farms: form.max_farms, max_users: form.max_users,
                  }))}
                  className="h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p className={`mb-md text-sm ${msg.ok ? 'text-success-ink' : 'text-warning-ink'}`}>{msg.text}</p>}

      {plans.length === 0 ? (
        <div className="bg-canvas border border-mute rounded-card p-2xl text-center text-body-soft text-sm">
          No plans yet. {canManage ? 'Create one to get started.' : ''}
        </div>
      ) : (
        <div className="grid gap-lg sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((p) => {
            const included = summarize(p, features);
            const preview = included.slice(0, 5);
            const extra = included.length - preview.length;
            return (
              <div
                key={p.id}
                className={`relative flex flex-col bg-canvas border rounded-card overflow-hidden transition-shadow hover:shadow-[rgba(0,0,0,0.03)_0_4px_24px] ${
                  p.recommended ? 'border-primary' : 'border-mute'
                } ${p.is_active ? '' : 'opacity-70'}`}
              >
                {p.recommended && (
                  <span className="absolute right-0 top-0 rounded-bl-card bg-primary px-sm py-xxs text-[11px] font-bold uppercase tracking-wide text-on-primary">
                    Recommended
                  </span>
                )}

                {/* Clickable body → feature detail */}
                <Link href={`/admin/subscriptions/${p.id}`} className="group block p-lg flex-1">
                  <div className="flex items-center gap-sm mb-xs">
                    <h3 className="text-lg font-bold text-ink group-hover:text-primary">{p.name}</h3>
                    <span
                      className={`text-[10px] font-bold uppercase rounded-sm px-xs py-px ${
                        p.is_active ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'
                      }`}
                    >
                      {p.is_active ? 'active' : 'archived'}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-body-soft mb-md">{p.code} · {p.tier ?? '—'}</p>

                  <div className="mb-md">
                    {p.is_contactable ? (
                      <span className="text-2xl font-bold text-ink">Contact us</span>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-ink tabular-nums">{rupee(p.monthly_price_inr)}</span>
                        <span className="text-sm text-body-soft">/mo</span>
                        <span className="block text-xs text-body-soft tabular-nums">{rupee(p.yearly_price_inr)}/yr</span>
                      </>
                    )}
                  </div>

                  <div className="mb-md flex gap-md text-xs text-body-soft">
                    <span>{p.max_farms ?? '∞'} farms</span>
                    <span>·</span>
                    <span>{p.max_users ?? '∞'} users</span>
                  </div>

                  <ul className="space-y-xs">
                    {preview.map((line) => (
                      <li key={line} className="flex items-start gap-xs text-xs text-body">
                        <Check size={14} className="mt-px shrink-0 text-success" />
                        <span>{line}</span>
                      </li>
                    ))}
                    {included.length === 0 && (
                      <li className="text-xs text-body-soft">No features enabled.</li>
                    )}
                  </ul>

                  <span className="mt-md inline-flex items-center gap-xs text-xs font-semibold text-primary">
                    {extra > 0 ? `View all features (+${extra} more)` : 'View all features'}
                    <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>

                {canManage && (
                  <div className="flex gap-xs border-t border-mute px-lg py-sm">
                    <button
                      className={footBtn}
                      disabled={pending}
                      onClick={() => act(() => setPlanActive(p.id, !p.is_active))}
                    >
                      {p.is_active ? <Archive size={14} /> : <Power size={14} />}
                      {p.is_active ? 'Archive' : 'Activate'}
                    </button>
                    <button
                      className={footBtn}
                      disabled={pending}
                      onClick={() => act(() => duplicatePlan(p.id, `${p.code}_copy`, `${p.name} (copy)`))}
                    >
                      <Copy size={14} /> Duplicate
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
