'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Plus, Power, Archive, Copy } from 'lucide-react';
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
}

export function PlanManager({ plans, canManage }: { plans: PlanListItem[]; canManage: boolean }) {
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

  const btn = 'inline-flex items-center gap-xs h-8 px-sm rounded-md text-xs font-semibold border border-mute text-body hover:bg-mute-soft disabled:opacity-50';

  return (
    <div>
      {canManage && (
        <div className="mb-lg">
          <button onClick={() => setShowCreate((v) => !v)} className="inline-flex items-center gap-sm h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark">
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

      <div className="bg-canvas border border-mute rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-body-soft border-b border-mute">
            <th className="px-md py-sm font-semibold">Plan</th>
            <th className="px-md py-sm font-semibold">Tier</th>
            <th className="px-md py-sm font-semibold text-right">Monthly</th>
            <th className="px-md py-sm font-semibold text-right">Yearly</th>
            <th className="px-md py-sm font-semibold">Limits</th>
            <th className="px-md py-sm font-semibold">State</th>
            {canManage && <th className="px-md py-sm font-semibold text-right">Actions</th>}
          </tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} className="border-b border-mute last:border-0">
                <td className="px-md py-sm">
                  <Link href={`/admin/subscriptions/${p.id}`} className="font-semibold text-primary hover:underline">{p.name}</Link>
                  <span className="block text-xs font-mono text-body-soft">{p.code}</span>
                </td>
                <td className="px-md py-sm text-body">{p.tier ?? '—'}</td>
                <td className="px-md py-sm text-right tabular-nums text-ink">₹{(p.monthly_price_inr ?? 0).toLocaleString('en-IN')}</td>
                <td className="px-md py-sm text-right tabular-nums text-ink">₹{(p.yearly_price_inr ?? 0).toLocaleString('en-IN')}</td>
                <td className="px-md py-sm text-body-soft">{p.max_farms ?? '∞'} farms · {p.max_users ?? '∞'} users</td>
                <td className="px-md py-sm">
                  <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${p.is_active ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                    {p.is_active ? 'active' : 'archived'}
                  </span>
                </td>
                {canManage && (
                  <td className="px-md py-sm">
                    <div className="flex justify-end gap-xs">
                      <button className={btn} disabled={pending} onClick={() => act(() => setPlanActive(p.id, !p.is_active))}>
                        {p.is_active ? <Archive size={14} /> : <Power size={14} />}
                        {p.is_active ? 'Archive' : 'Activate'}
                      </button>
                      <button className={btn} disabled={pending}
                        onClick={() => act(() => duplicatePlan(p.id, `${p.code}_copy`, `${p.name} (copy)`))}>
                        <Copy size={14} /> Duplicate
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
