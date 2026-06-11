'use client';

import { useState, useTransition } from 'react';
import { createDiscount, createCoupon, previewCoupon } from '@/lib/control/discounts';

export function DiscountTools({
  discounts,
  canManage,
}: {
  discounts: { id: string; name: string }[];
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [d, setD] = useState({ name: '', discount_type: 'percentage', value: '', scope: 'coupon', max_redemptions: '', first_purchase_only: false });
  const [c, setC] = useState({ discount_id: discounts[0]?.id ?? '', code: '', max_per_tenant: '1' });
  const [pv, setPv] = useState({ code: '', planCode: '' });
  const [pvResult, setPvResult] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string; detail?: string }>, isPreview = false) {
    setMsg(null); setPvResult(null);
    start(async () => {
      const r = await fn();
      if (isPreview) setPvResult(r.detail ?? (r.ok ? 'OK' : r.error ?? 'Failed'));
      else setMsg(r.ok ? { ok: true, text: 'Done.' } : { ok: false, text: r.error ?? 'Failed.' });
    });
  }

  const input = 'h-9 w-full px-sm rounded-lg border border-mute bg-canvas text-sm text-ink';
  const label = 'text-xs font-semibold text-body mb-xxs block';
  const primary = 'h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark disabled:opacity-50';

  return (
    <div className="grid gap-lg md:grid-cols-3">
      {/* Create discount */}
      <div className="bg-canvas border border-mute rounded-card p-lg">
        <h3 className="text-sm font-bold text-ink mb-md">New discount</h3>
        <div className="grid gap-sm">
          <label><span className={label}>Name</span><input className={input} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></label>
          <div className="grid grid-cols-2 gap-sm">
            <label><span className={label}>Type</span>
              <select className={input} value={d.discount_type} onChange={(e) => setD({ ...d, discount_type: e.target.value })}>
                <option value="percentage">Percentage</option><option value="flat">Flat ₹</option>
              </select>
            </label>
            <label><span className={label}>Value</span><input type="number" className={input} value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })} /></label>
          </div>
          <div className="grid grid-cols-2 gap-sm">
            <label><span className={label}>Scope</span>
              <select className={input} value={d.scope} onChange={(e) => setD({ ...d, scope: e.target.value })}>
                {['coupon','referral','partner','seasonal','lifetime','promotion'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label><span className={label}>Max redemptions</span><input type="number" placeholder="∞" className={input} value={d.max_redemptions} onChange={(e) => setD({ ...d, max_redemptions: e.target.value })} /></label>
          </div>
          <label className="flex items-center gap-sm text-xs text-body">
            <input type="checkbox" checked={d.first_purchase_only} onChange={(e) => setD({ ...d, first_purchase_only: e.target.checked })} />
            First purchase only
          </label>
          <button disabled={!canManage || pending} className={primary}
            onClick={() => run(() => createDiscount({
              name: d.name, discount_type: d.discount_type, value: d.value, scope: d.scope,
              max_redemptions: d.max_redemptions, first_purchase_only: d.first_purchase_only,
            }))}>Create discount</button>
        </div>
      </div>

      {/* Create coupon */}
      <div className="bg-canvas border border-mute rounded-card p-lg">
        <h3 className="text-sm font-bold text-ink mb-md">New coupon code</h3>
        <div className="grid gap-sm">
          <label><span className={label}>Discount</span>
            <select className={input} value={c.discount_id} onChange={(e) => setC({ ...c, discount_id: e.target.value })}>
              {discounts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
          <label><span className={label}>Code</span><input className={input} value={c.code} onChange={(e) => setC({ ...c, code: e.target.value.toUpperCase() })} /></label>
          <label><span className={label}>Max uses / tenant</span><input type="number" className={input} value={c.max_per_tenant} onChange={(e) => setC({ ...c, max_per_tenant: e.target.value })} /></label>
          <button disabled={!canManage || pending || discounts.length === 0} className={primary}
            onClick={() => run(() => createCoupon(c.discount_id, c.code, Number(c.max_per_tenant)))}>Create coupon</button>
        </div>
      </div>

      {/* Preview */}
      <div className="bg-canvas border border-mute rounded-card p-lg">
        <h3 className="text-sm font-bold text-ink mb-md">Validate a code</h3>
        <div className="grid gap-sm">
          <label><span className={label}>Code</span><input className={input} value={pv.code} onChange={(e) => setPv({ ...pv, code: e.target.value.toUpperCase() })} /></label>
          <label><span className={label}>Plan code (optional)</span><input className={input} value={pv.planCode} onChange={(e) => setPv({ ...pv, planCode: e.target.value })} /></label>
          <button disabled={pending} className="h-9 px-md rounded-lg text-sm font-semibold border border-mute text-body hover:bg-mute-soft disabled:opacity-50"
            onClick={() => run(() => previewCoupon(pv.code, pv.planCode), true)}>Check</button>
          {pvResult && <p className="text-sm text-body">{pvResult}</p>}
        </div>
      </div>

      {msg && <p className={`md:col-span-3 text-sm ${msg.ok ? 'text-success-ink' : 'text-warning-ink'}`}>{msg.text}</p>}
    </div>
  );
}
