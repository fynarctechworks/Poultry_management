'use client';

import { useState } from 'react';

export function ShareTraceability({ token, batchCode }: { token: string; batchCode: string }) {
  const [copied, setCopied] = useState(false);

  function publicUrl() {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/traceability/${token}`;
  }

  function copy() {
    navigator.clipboard.writeText(publicUrl());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareWhatsApp() {
    const msg = `PoultryOS farm-to-plate certificate for ${batchCode}: ${publicUrl()}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return (
    <div className="inline-flex gap-xxs">
      <button onClick={copy} className="btn-subtle text-xs px-md py-xs">{copied ? 'Copied' : 'Copy link'}</button>
      <button onClick={shareWhatsApp} className="inline-flex items-center justify-center bg-whatsapp text-white rounded-md px-md py-xs text-xs font-semibold hover:opacity-90">
        WhatsApp
      </button>
    </div>
  );
}
