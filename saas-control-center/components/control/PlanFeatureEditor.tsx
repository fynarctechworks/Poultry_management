'use client';

import { useState, useTransition } from 'react';
import { setPlanFeature } from '@/lib/control/plans';

export interface FeatureDef { code: string; name: string; value_type: string }

export function PlanFeatureEditor({
  planId,
  features,
  values,
  canManage,
}: {
  planId: string;
  features: FeatureDef[];
  values: Record<string, unknown>;
  canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, unknown>>(values);

  function save(code: string, value: boolean | number | null) {
    setLocal((p) => ({ ...p, [code]: value }));
    setMsg(null);
    start(async () => {
      const r = await setPlanFeature(planId, code, value);
      setMsg(r.ok ? 'Saved.' : ('error' in r ? r.error : 'Failed.'));
    });
  }

  return (
    <div className="bg-canvas border border-mute rounded-card p-lg">
      <h3 className="text-sm font-bold text-ink mb-md">Features</h3>
      <div className="grid gap-sm">
        {features.map((f) => {
          const v = local[f.code];
          return (
            <div key={f.code} className="flex items-center justify-between gap-md py-xs border-b border-mute last:border-0">
              <span className="text-sm text-ink">{f.name} <span className="text-body-soft font-mono text-xs">{f.code}</span></span>
              {f.value_type === 'boolean' ? (
                <button
                  disabled={!canManage || pending}
                  onClick={() => save(f.code, !(v === true))}
                  className={`text-[11px] font-bold uppercase rounded-sm px-sm py-xs disabled:opacity-50 ${v === true ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}
                >
                  {v === true ? 'on' : 'off'}
                </button>
              ) : (
                <div className="flex items-center gap-sm">
                  <input
                    type="number"
                    disabled={!canManage || pending || v === null}
                    defaultValue={v === null || v === undefined ? '' : String(v)}
                    onBlur={(e) => save(f.code, e.target.value === '' ? null : Number(e.target.value))}
                    placeholder="∞"
                    className="h-8 w-24 px-sm rounded-md border border-mute bg-canvas text-sm text-ink disabled:opacity-50"
                  />
                  <label className="flex items-center gap-xs text-xs text-body">
                    <input
                      type="checkbox" disabled={!canManage || pending}
                      checked={v === null}
                      onChange={(e) => save(f.code, e.target.checked ? null : 0)}
                    />
                    ∞
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {msg && <p className="mt-md text-sm text-body-soft">{msg}</p>}
      {!canManage && <p className="mt-md text-sm text-body-soft">Read-only access — feature editing disabled.</p>}
    </div>
  );
}
