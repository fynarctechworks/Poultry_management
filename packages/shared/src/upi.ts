// Single source of truth for UPI/VPA logic (payments-correctness critical).
// BHIM URI scheme per CLAUDE.md: upi://pay?pa=&pn=&am=&cu=INR&tn=

export interface UpiPayload {
  vpa: string;
  payeeName: string;
  amount: number;
  note?: string;
}

const VPA_REGEX = /^[\w.\-]+@[\w.\-]+$/;

export function isValidVpa(vpa: string | null | undefined): boolean {
  return typeof vpa === 'string' && VPA_REGEX.test(vpa.trim());
}

export function buildUpiUri({ vpa, payeeName, amount, note }: UpiPayload): string {
  const params = new URLSearchParams({
    pa: vpa,
    pn: payeeName,
    am: amount.toFixed(2),
    cu: 'INR',
  });
  if (note) params.set('tn', note);
  return `upi://pay?${params.toString()}`;
}
