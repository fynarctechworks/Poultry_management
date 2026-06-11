'use client';

import { formatCurrencyINR } from '@/lib/utils';

interface Props {
  buyerName: string;
  phone: string | null;
  amount: number;
  farmName: string;
  farmUpi: string | null;
}

export function ReminderButton({ buyerName, phone, amount, farmName, farmUpi }: Props) {
  function send() {
    if (!phone) {
      alert('No WhatsApp number on file for this buyer.');
      return;
    }
    const msg = `Reminder: ${formatCurrencyINR(amount)} pending from ${buyerName}. Pay via UPI: ${farmUpi ?? '(set UPI ID)'} — ${farmName}`;
    const clean = phone.replace(/[^\d]/g, '');
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  return (
    <button
      onClick={send}
      className="inline-flex items-center justify-center bg-whatsapp text-white rounded-md px-md py-xs text-xs font-semibold hover:opacity-90"
    >
      Remind
    </button>
  );
}
