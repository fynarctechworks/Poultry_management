// =============================================================================
// Razorpay Checkout.js — shared loader + subscription-checkout opener.
// =============================================================================
// One place that knows how to (a) lazy-load the hosted checkout.js script and
// (b) open the in-app subscription mandate modal. Reused by the onboarding
// wizard and the billing upgrade flow so the two never drift apart.
// =============================================================================

export interface RazorpaySuccess {
  razorpay_payment_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature?: string;
}

export interface OpenSubscriptionCheckoutOptions {
  keyId: string;
  subscriptionId: string;
  name?: string;
  description?: string;
  themeColor?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  onSuccess: (resp: RazorpaySuccess) => void;
  onDismiss?: () => void;
  onFailed?: (message: string) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: unknown) => void) => void };
  }
}

/** Lazily inject checkout.js. Resolves false if the script can't be loaded. */
export function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

/**
 * Load checkout.js (if needed) and open the subscription mandate modal.
 * Throws if the gateway script fails to load; otherwise wires the handlers.
 */
export async function openSubscriptionCheckout(opts: OpenSubscriptionCheckoutOptions): Promise<void> {
  const ready = await loadRazorpay();
  if (!ready || !window.Razorpay) {
    throw new Error('Could not load the payment gateway. Check your connection and try again.');
  }
  const rzp = new window.Razorpay({
    key: opts.keyId,
    subscription_id: opts.subscriptionId,
    name: opts.name ?? 'PoultryOS',
    description: opts.description,
    theme: opts.themeColor ? { color: opts.themeColor } : undefined,
    prefill: opts.prefill,
    handler: (resp: unknown) => opts.onSuccess((resp ?? {}) as RazorpaySuccess),
    modal: { ondismiss: () => opts.onDismiss?.() },
  });
  rzp.on('payment.failed', (resp: unknown) => {
    const r = resp as { error?: { description?: string } } | undefined;
    opts.onFailed?.(r?.error?.description ?? 'Payment failed. Please try again.');
  });
  rzp.open();
}
