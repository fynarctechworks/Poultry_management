'use client';

import { useState, useTransition } from 'react';
import { createTicket, setTicketStatus, logCall, completeFollowup } from '@/lib/control/support';

const TICKET_STATUSES = ['open', 'pending', 'escalated', 'resolved', 'closed'];

export interface TicketRow {
  id: string; subject: string; status: string; priority: string;
  created_at: string; tenants: { name: string } | null;
}
export interface CallRow {
  id: string; direction: string; phone: string | null; outcome: string | null;
  created_at: string; tenants: { name: string } | null;
}
export interface FollowupRow {
  id: string; reason: string | null; due_at: string | null; status: string;
  tenants: { name: string } | null;
}

export function SupportConsole({
  tickets, calls, followups, canManage,
}: {
  tickets: TicketRow[]; calls: CallRow[]; followups: FollowupRow[]; canManage: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [t, setT] = useState({ tenant_id: '', subject: '', description: '', priority: 'normal' });
  const [c, setC] = useState({ tenant_id: '', direction: 'outbound', phone: '', outcome: '', note: '' });

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { ok: true, text: 'Done.' } : { ok: false, text: r.error ?? 'Failed.' });
    });
  }

  const input = 'h-9 w-full px-sm rounded-lg border border-mute bg-canvas text-sm text-ink';
  const label = 'text-xs font-semibold text-body mb-xxs block';
  const primary = 'h-9 px-md rounded-lg text-sm font-semibold bg-primary text-on-primary hover:bg-primary-dark disabled:opacity-50';
  const card = 'bg-canvas border border-mute rounded-card p-lg';

  return (
    <div className="grid gap-lg">
      {msg && <p className={`text-sm ${msg.ok ? 'text-success-ink' : 'text-warning-ink'}`}>{msg.text}</p>}

      {canManage && (
        <div className="grid md:grid-cols-2 gap-lg">
          <div className={card}>
            <h3 className="text-sm font-bold text-ink mb-md">New ticket</h3>
            <div className="grid gap-sm">
              <label><span className={label}>Subject</span><input className={input} value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} /></label>
              <label><span className={label}>Description</span><textarea className="w-full px-sm py-sm rounded-lg border border-mute bg-canvas text-sm text-ink" rows={2} value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} /></label>
              <div className="grid grid-cols-2 gap-sm">
                <label><span className={label}>Priority</span>
                  <select className={input} value={t.priority} onChange={(e) => setT({ ...t, priority: e.target.value })}>
                    {['low','normal','high','urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label><span className={label}>Tenant ID (optional)</span><input className={input} value={t.tenant_id} onChange={(e) => setT({ ...t, tenant_id: e.target.value })} /></label>
              </div>
              <button disabled={pending} className={primary} onClick={() => run(() => createTicket(t.tenant_id || null, t.subject, t.description, t.priority))}>Open ticket</button>
            </div>
          </div>

          <div className={card}>
            <h3 className="text-sm font-bold text-ink mb-md">Log a call</h3>
            <div className="grid gap-sm">
              <div className="grid grid-cols-2 gap-sm">
                <label><span className={label}>Direction</span>
                  <select className={input} value={c.direction} onChange={(e) => setC({ ...c, direction: e.target.value })}>
                    <option value="outbound">Outbound</option><option value="inbound">Inbound</option>
                  </select>
                </label>
                <label><span className={label}>Phone</span><input className={input} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></label>
              </div>
              <label><span className={label}>Outcome</span><input className={input} value={c.outcome} onChange={(e) => setC({ ...c, outcome: e.target.value })} /></label>
              <label><span className={label}>Tenant ID (optional)</span><input className={input} value={c.tenant_id} onChange={(e) => setC({ ...c, tenant_id: e.target.value })} /></label>
              <button disabled={pending} className={primary} onClick={() => run(() => logCall(c.tenant_id || null, c.direction, c.phone, c.outcome, c.note))}>Log call</button>
            </div>
          </div>
        </div>
      )}

      {/* Ticket queue */}
      <div className={card}>
        <h3 className="text-sm font-bold text-ink mb-md">Ticket queue</h3>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-body-soft border-b border-mute">
            <th className="py-sm font-semibold">Subject</th><th className="py-sm font-semibold">Tenant</th>
            <th className="py-sm font-semibold">Priority</th><th className="py-sm font-semibold">Status</th>
          </tr></thead>
          <tbody>
            {tickets.length === 0 ? <tr><td colSpan={4} className="py-lg text-center text-body-soft">No tickets.</td></tr>
            : tickets.map((tk) => (
              <tr key={tk.id} className="border-b border-mute last:border-0">
                <td className="py-sm text-ink font-semibold">{tk.subject}</td>
                <td className="py-sm text-body">{tk.tenants?.name ?? '—'}</td>
                <td className="py-sm text-body capitalize">{tk.priority}</td>
                <td className="py-sm">
                  {canManage ? (
                    <select disabled={pending} defaultValue={tk.status} onChange={(e) => run(() => setTicketStatus(tk.id, e.target.value))}
                      className="h-8 px-sm rounded-md border border-mute bg-canvas text-xs text-ink">
                      {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : <span className="text-body capitalize">{tk.status}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid md:grid-cols-2 gap-lg">
        <div className={card}>
          <h3 className="text-sm font-bold text-ink mb-md">Recent calls</h3>
          {calls.length === 0 ? <p className="text-sm text-body-soft">No calls.</p> : (
            <ul className="text-sm divide-y divide-mute">
              {calls.map((cl) => (
                <li key={cl.id} className="py-xs flex justify-between">
                  <span className="text-ink capitalize">{cl.direction} · {cl.tenants?.name ?? cl.phone ?? '—'}</span>
                  <span className="text-body-soft">{cl.outcome ?? '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className={card}>
          <h3 className="text-sm font-bold text-ink mb-md">Open follow-ups</h3>
          {followups.length === 0 ? <p className="text-sm text-body-soft">No open follow-ups.</p> : (
            <ul className="text-sm divide-y divide-mute">
              {followups.map((f) => (
                <li key={f.id} className="py-xs flex justify-between items-center gap-sm">
                  <span className="text-ink">{f.tenants?.name ?? '—'}: {f.reason}</span>
                  {canManage && <button disabled={pending} onClick={() => run(() => completeFollowup(f.id))} className="text-xs font-semibold text-primary hover:underline">Done</button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
