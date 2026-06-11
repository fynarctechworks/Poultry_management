// PoultryOS — product analytics funnel (client).
//
// Fire-and-forget event tracking for the activation funnel. Calls the
// `track_event` RPC, which resolves the tenant from the caller's profile
// server-side. Never throws and never blocks the UI — analytics must not be
// able to break a user flow.

import { supabase } from './supabase';

export const FUNNEL = {
  SIGNUP_STARTED: 'signup_started',
  OTP_VERIFIED: 'otp_verified',
  EMAIL_VERIFIED: 'email_verified',
  ONBOARDING_COMPLETED: 'onboarding_completed',
  FIRST_SHED_CREATED: 'first_shed_created',
  FIRST_BATCH_CREATED: 'first_batch_created',
  FIRST_DAILY_ENTRY: 'first_daily_entry',
  PLAN_SELECTED: 'plan_selected',
  PAYMENT_COMPLETED: 'payment_completed',
} as const;

export type FunnelEvent = (typeof FUNNEL)[keyof typeof FUNNEL];

/** Record a funnel event. Best-effort: swallows all errors. */
export async function track(
  eventName: FunnelEvent | string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    await supabase.rpc('track_event', {
      p_event_name: eventName,
      p_properties: properties,
    });
  } catch {
    // analytics is non-critical — never surface or rethrow.
  }
}
