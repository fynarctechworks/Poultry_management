'use client';

import { useState, useTransition } from 'react';
import {
  Ban, CheckCircle2, Trash2, RotateCcw, CalendarPlus, ArrowLeftRight, RefreshCw, UserCog,
} from 'lucide-react';
import {
  suspendTenant, activateTenant, softDeleteTenant, restoreTenant,
  extendTrial, changePlan, resetSubscription, impersonateTenant, type ActionResult,
} from '@/lib/control/tenants';

interface PlanOption { code: string; name: string }

export function TenantActions({
  tenantId,
  status,
  deleted,
  plans,
}: {
  tenantId: string;
  status: string;
  deleted: boolean;
  plans: PlanOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string; link?: string } | null>(null);
  const [modal, setModal] = useState<null | 'suspend' | 'delete' | 'impersonate'>(null);
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(7);
  const [planCode, setPlanCode] = useState(plans[0]?.code ?? '');
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');

  function run(fn: () => Promise<ActionResult>) {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        setMsg({ ok: true, text: 'Done.', link: r.link });
        setModal(null);
        setReason('');
      } else {
        setMsg({ ok: false, text: r.error });
      }
    });
  }

  const btn =
    'inline-flex items-center gap-sm h-9 px-md rounded-lg text-sm font-semibold border border-mute text-body hover:bg-mute-soft disabled:opacity-50';
  const danger =
    'inline-flex items-center gap-sm h-9 px-md rounded-lg text-sm font-semibold border border-warning text-warning-ink hover:bg-warning-soft disabled:opacity-50';

  return (
    <div className="bg-canvas border border-mute rounded-card p-lg">
      <h3 className="text-sm font-bold text-ink mb-md">Actions</h3>

      <div className="flex flex-wrap gap-sm">
        {deleted ? (
          <button className={btn} disabled={pending} onClick={() => run(() => restoreTenant(tenantId))}>
            <RotateCcw size={16} /> Restore
          </button>
        ) : (
          <>
            {status === 'suspended' ? (
              <button className={btn} disabled={pending} onClick={() => run(() => activateTenant(tenantId))}>
                <CheckCircle2 size={16} /> Activate
              </button>
            ) : (
              <button className={danger} disabled={pending} onClick={() => setModal('suspend')}>
                <Ban size={16} /> Suspend
              </button>
            )}
            <button className={danger} disabled={pending} onClick={() => setModal('delete')}>
              <Trash2 size={16} /> Soft delete
            </button>
            <button className={btn} disabled={pending} onClick={() => setModal('impersonate')}>
              <UserCog size={16} /> Impersonate
            </button>
          </>
        )}
        <button className={btn} disabled={pending} onClick={() => run(() => resetSubscription(tenantId))}>
          <RefreshCw size={16} /> Reset subscription
        </button>
      </div>

      {/* Inline controls: extend trial + change plan */}
      <div className="mt-lg grid gap-md md:grid-cols-2">
        <div className="flex items-end gap-sm">
          <label className="flex-1">
            <span className="block text-xs font-semibold text-body mb-xxs">Extend trial (days)</span>
            <input
              type="number" min={1} value={days}
              onChange={(e) => setDays(parseInt(e.target.value || '0', 10))}
              className="h-9 w-full px-md rounded-lg border border-mute bg-canvas text-sm text-ink"
            />
          </label>
          <button className={btn} disabled={pending} onClick={() => run(() => extendTrial(tenantId, days))}>
            <CalendarPlus size={16} /> Extend
          </button>
        </div>

        <div className="flex items-end gap-sm">
          <label className="flex-1">
            <span className="block text-xs font-semibold text-body mb-xxs">Change plan</span>
            <select
              value={planCode} onChange={(e) => setPlanCode(e.target.value)}
              className="h-9 w-full px-sm rounded-lg border border-mute bg-canvas text-sm text-ink"
            >
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </label>
          <select
            value={cycle} onChange={(e) => setCycle(e.target.value as 'monthly' | 'yearly')}
            className="h-9 px-sm rounded-lg border border-mute bg-canvas text-sm text-ink"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          <button className={btn} disabled={pending} onClick={() => run(() => changePlan(tenantId, planCode, cycle))}>
            <ArrowLeftRight size={16} /> Apply
          </button>
        </div>
      </div>

      {msg && (
        <div className={`mt-md text-sm ${msg.ok ? 'text-success-ink' : 'text-warning-ink'}`}>
          {msg.text}
          {msg.link && (
            <div className="mt-xs break-all">
              Impersonation link (open in a private window):{' '}
              <a href={msg.link} className="text-primary underline" target="_blank" rel="noreferrer">{msg.link}</a>
            </div>
          )}
        </div>
      )}

      {/* Reason modal for destructive / impersonation actions */}
      {modal && (
        <div className="fixed inset-0 bg-ink/40 grid place-items-center z-30 p-lg">
          <div className="bg-canvas border border-mute rounded-card p-xl w-full max-w-[420px]">
            <h4 className="text-base font-bold text-ink mb-xs">
              {modal === 'suspend' ? 'Suspend tenant' : modal === 'delete' ? 'Soft delete tenant' : 'Impersonate owner'}
            </h4>
            <p className="text-sm text-body-soft mb-md">
              {modal === 'impersonate'
                ? 'This generates an audited sign-in link for the owner. A reason is required.'
                : 'This is reversible but high-impact. A reason is required and will be audited.'}
            </p>
            <textarea
              value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (required)…" rows={3}
              className="w-full px-md py-sm rounded-lg border border-mute bg-canvas text-sm text-ink mb-md"
            />
            <div className="flex justify-end gap-sm">
              <button className={btn} disabled={pending} onClick={() => { setModal(null); setReason(''); }}>
                Cancel
              </button>
              <button
                className={modal === 'impersonate' ? btn : danger}
                disabled={pending || !reason.trim()}
                onClick={() =>
                  run(() =>
                    modal === 'suspend'
                      ? suspendTenant(tenantId, reason)
                      : modal === 'delete'
                        ? softDeleteTenant(tenantId, reason)
                        : impersonateTenant(tenantId, reason)
                  )
                }
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
