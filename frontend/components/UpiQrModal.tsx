'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { buildUpiUri, isValidVpa } from '@/lib/upi';
import { formatCurrencyINR } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  vpa: string | null;
  payeeName: string;
  amount: number;
  note?: string;
  buyerName?: string;
}

export function UpiQrModal({ open, onClose, vpa, payeeName, amount, note, buyerName }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!isValidVpa(vpa)) {
      setError('Set a valid UPI ID on the farm before generating a QR.');
      return;
    }
    const uri = buildUpiUri({ vpa: vpa!.trim(), payeeName, amount, note });
    QRCode.toDataURL(uri, { width: 320, margin: 1 })
      .then(setDataUrl)
      .catch((e) => setError(e.message));
  }, [open, vpa, payeeName, amount, note]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-ink/60 flex items-center justify-center px-lg z-50" onClick={onClose}>
      <div className="bg-canvas rounded-card p-2xl max-w-[400px] w-full" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-ink">Scan to pay</h2>
        {buyerName && <p className="text-sm text-body mt-xxs">From {buyerName}</p>}
        <p className="text-3xl font-bold text-upi mt-md">{formatCurrencyINR(amount)}</p>

        {error && <p className="text-sm text-danger mt-lg">{error}</p>}

        {dataUrl && (
          <div className="mt-lg flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={dataUrl} alt="UPI QR code" width={320} height={320} className="rounded-md" />
          </div>
        )}

        <p className="text-xs text-body-soft text-center mt-md">
          Open any UPI app (PhonePe, GPay, Paytm, BHIM) and scan.
        </p>

        <button onClick={onClose} className="btn-outline w-full mt-lg">Close</button>
      </div>
    </div>
  );
}
