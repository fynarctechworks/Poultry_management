'use client';

import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { createFlag, setFlag } from '@/lib/control/flags';

export interface FlagRow {
  id: string; key: string; name: string; description: string | null;
  is_enabled: boolean; rollout_percentage: number;
}

export function FlagManager({ flags, canManage }: { flags: FlagRow[]; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ key: '', name: '', description: '', enabled: false, rollout: 100 });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: 'Saved.' } : { ok: false, text: r.error ?? 'Failed.' });
      if (r.ok) setShow(false);
    });
  }

  const input = 'h-9 px-sm rounded-lg border border-mute bg-canvas text-sm text-ink';
  const primary = 'h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark disabled:opacity-50';

  return (
    <div>
      {canManage && (
        <div className="mb-lg">
          <button onClick={() => setShow((v) => !v)} className="inline-flex items-center gap-sm h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark">
            <Plus size={16} /> New flag
          </button>
          {show && (
            <div className="mt-md bg-canvas border border-mute rounded-card p-lg grid md:grid-cols-3 gap-md">
              <input className={input} placeholder="key (e.g. new_dashboard)" value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} />
              <input className={input} placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              <input className={input} placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              <label className="flex items-center gap-sm text-sm text-body">
                <input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Enabled
              </label>
              <label className="flex items-center gap-sm text-sm text-body">
                Rollout %<input type="number" min={0} max={100} className={`${input} w-20`} value={f.rollout} onChange={(e) => setF({ ...f, rollout: Number(e.target.value) })} />
              </label>
              <button disabled={pending} className={primary} onClick={() => run(() => createFlag(f.key, f.name, f.description, f.enabled, f.rollout))}>Create</button>
            </div>
          )}
        </div>
      )}

      {msg && <p className={`mb-md text-sm ${msg.ok ? 'text-success-ink' : 'text-warning-ink'}`}>{msg.text}</p>}

      <div className="bg-canvas border border-mute rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-body-soft border-b border-mute">
            <th className="px-md py-sm font-semibold">Flag</th>
            <th className="px-md py-sm font-semibold">Enabled</th>
            <th className="px-md py-sm font-semibold">Rollout</th>
          </tr></thead>
          <tbody>
            {flags.length === 0 ? (
              <tr><td colSpan={3} className="px-md py-2xl text-center text-body-soft">No feature flags yet.</td></tr>
            ) : flags.map((fl) => (
              <tr key={fl.id} className="border-b border-mute last:border-0">
                <td className="px-md py-sm">
                  <span className="font-semibold text-ink">{fl.name}</span>
                  <span className="block text-xs font-mono text-body-soft">{fl.key}{fl.description ? ` — ${fl.description}` : ''}</span>
                </td>
                <td className="px-md py-sm">
                  {canManage ? (
                    <button disabled={pending} onClick={() => run(() => setFlag(fl.id, !fl.is_enabled, fl.rollout_percentage))}
                      className={`text-[11px] font-bold uppercase rounded-sm px-sm py-xs ${fl.is_enabled ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>
                      {fl.is_enabled ? 'on' : 'off'}
                    </button>
                  ) : (
                    <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${fl.is_enabled ? 'bg-success-soft text-success-ink' : 'bg-mute-soft text-body'}`}>{fl.is_enabled ? 'on' : 'off'}</span>
                  )}
                </td>
                <td className="px-md py-sm">
                  {canManage ? (
                    <input type="number" min={0} max={100} defaultValue={fl.rollout_percentage} disabled={pending}
                      onBlur={(e) => { const v = Number(e.target.value); if (v !== fl.rollout_percentage) run(() => setFlag(fl.id, fl.is_enabled, v)); }}
                      className="h-8 w-20 px-sm rounded-md border border-mute bg-canvas text-sm text-ink" />
                  ) : <span className="text-body">{fl.rollout_percentage}%</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
