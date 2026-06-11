'use client';

import { useState } from 'react';
import { UpiQrModal } from '@/components/UpiQrModal';
import { formatCurrencyINR } from '@/lib/utils';

interface Props {
  buyerName: string;
  buyerPhone: string | null;
  outstanding: number;
  farmUpiId: string | null;
  farmName: string;
}

export function BuyerActions({ buyerName, buyerPhone, outstanding, farmUpiId, farmName }: Props) {
  const [qrOpen, setQrOpen] = useState(false);

  function sendWhatsAppReminder() {
    if (!buyerPhone) {
      alert('No WhatsApp number on file for this buyer.');
      return;
    }
    const msg = `Hi ${buyerName}, ${formatCurrencyINR(outstanding)} is pending for poultry purchases. Please pay at your earliest convenience. UPI: ${farmUpiId ?? '(set UPI ID)'} — ${farmName}`;
    const clean = buyerPhone.replace(/[^\d]/g, '');
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return (
    <div className="flex flex-wrap gap-sm">
      <button
        onClick={() => setQrOpen(true)}
        className="btn-primary"
        disabled={outstanding <= 0}
        style={{ backgroundColor: outstanding > 0 ? undefined : undefined }}
      >
        Generate UPI QR
      </button>
      <button onClick={sendWhatsAppReminder} className="inline-flex items-center justify-center bg-whatsapp text-white rounded-lg px-lg py-md font-semibold text-base min-h-[44px] hover:opacity-90">
        Send WhatsApp reminder
      </button>
      <UpiQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        vpa={farmUpiId}
        payeeName={farmName}
        amount={outstanding}
        note={`PoultryOS payment from ${buyerName}`}
        buyerName={buyerName}
      />
    </div>
  );
}
