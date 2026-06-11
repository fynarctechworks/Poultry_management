'use client';

import { useState, useTransition } from 'react';
import { setErrorStatus, assignErrorToMe, addErrorComment } from '@/lib/control/errors';

const STATUSES = ['open', 'investigating', 'resolved', 'ignored'];

export function ErrorWorkflow({ errorId, status, canManage }: { errorId: string; status: string; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? 'Saved.' : (r.error ?? 'Failed.'));
      if (r.ok) setComment('');
    });
  }

  if (!canManage) return <p className="text-sm text-body-soft">Read-only access — triage disabled.</p>;

  const btn = 'h-8 px-md rounded-md text-xs font-semibold border border-mute text-body hover:bg-mute-soft disabled:opacity-50';

  return (
    <div className="grid gap-md">
      <div className="flex flex-wrap items-center gap-sm">
        <span className="text-xs font-semibold text-body-soft">Status:</span>
        {STATUSES.map((s) => (
          <button key={s} disabled={pending || s === status} onClick={() => run(() => setErrorStatus(errorId, s))}
            className={`${btn} ${s === status ? 'bg-primary-subtle text-primary border-primary-dark' : ''}`}>{s}</button>
        ))}
        <button disabled={pending} onClick={() => run(() => assignErrorToMe(errorId))} className={btn}>Assign to me</button>
      </div>

      <div className="flex items-end gap-sm">
        <label className="flex-1">
          <span className="block text-xs font-semibold text-body mb-xxs">Add comment</span>
          <input value={comment} onChange={(e) => setComment(e.target.value)} className="h-9 w-full px-sm rounded-lg border border-mute bg-canvas text-sm text-ink" />
        </label>
        <button disabled={pending || !comment.trim()} onClick={() => run(() => addErrorComment(errorId, comment))}
          className="h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark disabled:opacity-50">Comment</button>
      </div>

      {msg && <p className="text-sm text-body-soft">{msg}</p>}
    </div>
  );
}
