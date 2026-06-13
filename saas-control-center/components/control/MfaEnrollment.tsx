'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Smartphone, Trash2 } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Factor = { id: string; friendly_name?: string | null; status: string };
type Enrolling = { factorId: string; qr: string; secret: string };

export function MfaEnrollment() {
  const supabase = createSupabaseBrowserClient();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) setError(error.message);
    else setFactors(((data?.totp ?? []) as Factor[]));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startEnroll() {
    setError(null);
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setCode('');
  }

  async function verify() {
    if (!enrolling) return;
    setError(null);
    setBusy(true);
    const challenge = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
    if (challenge.error) {
      setBusy(false);
      return setError(challenge.error.message);
    }
    const { error } = await supabase.auth.mfa.verify({
      factorId: enrolling.factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    setBusy(false);
    if (error) return setError(error.message);
    setEnrolling(null);
    setCode('');
    await refresh();
  }

  async function cancelEnroll() {
    if (enrolling) await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    setEnrolling(null);
    setError(null);
    setCode('');
  }

  async function remove(factorId: string) {
    setError(null);
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) return setError(error.message);
    await refresh();
  }

  const verified = factors.filter((f) => f.status === 'verified');

  return (
    <div className="card shadow-subtle">
      <div className="flex items-center gap-md mb-lg">
        <span className="grid place-items-center w-9 h-9 rounded-lg bg-primary-subtle text-primary">
          <ShieldCheck size={18} />
        </span>
        <div>
          <h2 className="text-base font-semibold text-ink">Two-factor authentication (TOTP)</h2>
          <p className="text-sm text-body-soft">
            Use an authenticator app (Google Authenticator, Authy, 1Password).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-12 rounded-md bg-mute-soft animate-pulse" />
      ) : verified.length > 0 ? (
        <ul className="space-y-sm mb-lg">
          {verified.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-md px-md py-sm rounded-md border border-mute"
            >
              <span className="flex items-center gap-sm text-sm text-ink">
                <Smartphone size={16} className="text-success" />
                {f.friendly_name || 'Authenticator'}
                <span className="text-[10px] font-bold uppercase bg-success-soft text-success-ink rounded-sm px-xs py-px">
                  active
                </span>
              </span>
              <button
                onClick={() => remove(f.id)}
                className="flex items-center gap-xs text-sm font-semibold text-danger hover:underline"
              >
                <Trash2 size={14} /> Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-body mb-lg">No authenticator enrolled yet.</p>
      )}

      {!enrolling ? (
        <button onClick={startEnroll} className="btn-primary" disabled={busy}>
          {busy ? 'Starting…' : verified.length > 0 ? 'Add another authenticator' : 'Enable 2FA'}
        </button>
      ) : (
        <div className="border-t border-mute pt-lg space-y-md">
          <p className="text-sm text-body">
            1. Scan this QR code with your authenticator app, or enter the secret manually.
          </p>
          {/* Supabase returns the QR as an SVG data URI. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={enrolling.qr} alt="TOTP QR code" className="w-[200px] h-[200px] border border-mute rounded-md bg-canvas" />
          <p className="text-xs text-body-soft break-all">
            Secret: <span className="font-mono text-ink">{enrolling.secret}</span>
          </p>
          <div>
            <label className="label">2. Enter the 6-digit code</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="input tracking-[0.5em] text-center max-w-[180px]"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
            />
          </div>
          <div className="flex gap-sm">
            <button onClick={verify} className="btn-primary" disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : 'Verify & activate'}
            </button>
            <button onClick={cancelEnroll} className="btn-subtle" disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger mt-md">{error}</p>}
    </div>
  );
}
