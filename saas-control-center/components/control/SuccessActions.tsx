'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createFollowup, completeFollowup, logInteraction } from '@/lib/control/success';

const INTERACTION_TYPES = ['call', 'whatsapp', 'email', 'note', 'meeting'] as const;
type InteractionType = (typeof INTERACTION_TYPES)[number];

const TYPE_CHIP: Record<InteractionType, string> = {
  call:      'bg-primary-subtle text-primary',
  whatsapp:  'bg-success-soft text-success-ink',
  email:     'bg-info-soft text-info',
  note:      'bg-mute-soft text-body',
  meeting:   'bg-pending-soft text-pending-ink',
};

export function SuccessActions({
  tenantId,
  canManage,
}: {
  tenantId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [interactionMsg, setInteractionMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [followupMsg, setFollowupMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [intType, setIntType] = useState<InteractionType>('call');
  const [intSummary, setIntSummary] = useState('');
  const [fuReason, setFuReason] = useState('');
  const [fuDate, setFuDate] = useState('');

  if (!canManage) {
    return (
      <p className="text-sm text-body-soft italic">
        Read-only — success:manage required to log activity.
      </p>
    );
  }

  function runInteraction() {
    setInteractionMsg(null);
    start(async () => {
      const r = await logInteraction(tenantId, intType, intSummary);
      if (r.ok) {
        setInteractionMsg({ ok: true, text: 'Interaction logged.' });
        setIntSummary('');
        router.refresh();
      } else {
        setInteractionMsg({ ok: false, text: r.error ?? 'Failed.' });
      }
    });
  }

  function runFollowup() {
    setFollowupMsg(null);
    start(async () => {
      const dueIso = fuDate ? new Date(fuDate).toISOString() : '';
      const r = await createFollowup(tenantId, fuReason, dueIso);
      if (r.ok) {
        setFollowupMsg({ ok: true, text: 'Follow-up created.' });
        setFuReason('');
        setFuDate('');
        router.refresh();
      } else {
        setFollowupMsg({ ok: false, text: r.error ?? 'Failed.' });
      }
    });
  }

  const input = 'h-9 w-full px-sm rounded-lg border border-mute bg-canvas text-sm text-ink';
  const label = 'text-xs font-semibold text-body mb-xxs block';
  const primary = 'h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark disabled:opacity-50';
  const card = 'bg-canvas border border-mute rounded-card p-lg';

  return (
    <div className="grid md:grid-cols-2 gap-lg">
      {/* Log interaction */}
      <div className={card}>
        <h3 className="text-sm font-bold text-ink mb-md">Log interaction</h3>
        <div className="grid gap-sm">
          <label>
            <span className={label}>Type</span>
            <select
              className={input}
              value={intType}
              onChange={(e) => setIntType(e.target.value as InteractionType)}
            >
              {INTERACTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={label}>Summary (optional)</span>
            <input
              className={input}
              value={intSummary}
              onChange={(e) => setIntSummary(e.target.value)}
              placeholder="Brief notes…"
            />
          </label>
          <button
            disabled={pending}
            className={primary}
            onClick={runInteraction}
          >
            Log
          </button>
          {interactionMsg && (
            <p className={`text-xs ${interactionMsg.ok ? 'text-success-ink' : 'text-danger'}`}>
              {interactionMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* Create follow-up */}
      <div className={card}>
        <h3 className="text-sm font-bold text-ink mb-md">Create follow-up</h3>
        <div className="grid gap-sm">
          <label>
            <span className={label}>Reason</span>
            <input
              className={input}
              value={fuReason}
              onChange={(e) => setFuReason(e.target.value)}
              placeholder="e.g. Check in after onboarding"
            />
          </label>
          <label>
            <span className={label}>Due date (optional)</span>
            <input
              type="date"
              className={input}
              value={fuDate}
              onChange={(e) => setFuDate(e.target.value)}
            />
          </label>
          <button
            disabled={pending}
            className={primary}
            onClick={runFollowup}
          >
            Create
          </button>
          {followupMsg && (
            <p className={`text-xs ${followupMsg.ok ? 'text-success-ink' : 'text-danger'}`}>
              {followupMsg.text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Tiny standalone button used in the detail page per-row "Mark done" affordance.
export function CompleteFollowupButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleClick() {
    setErr(null);
    start(async () => {
      const r = await completeFollowup(id);
      if (r.ok) {
        router.refresh();
      } else {
        setErr(r.error ?? 'Failed.');
      }
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-xxs">
      <button
        disabled={pending}
        onClick={handleClick}
        className="text-xs font-semibold text-primary hover:underline disabled:opacity-50"
      >
        Mark done
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </span>
  );
}

// Re-export TYPE_CHIP for use in the detail page timeline.
export { TYPE_CHIP };
