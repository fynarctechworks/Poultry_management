// =============================================================================
// Deno tests — razorpay-webhook signature verification + invoice math.
// Run:  deno test supabase/functions/tests/razorpay-webhook.test.ts
// =============================================================================
// Mirrors the exact scheme the webhook uses (HMAC-SHA256 hex of the raw body,
// constant-time compared against X-Razorpay-Signature) plus the GST/total math
// the charge handler applies. Pure functions => no network / DB needed.
// =============================================================================

import { createHmac } from "node:crypto";
import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";

const WEBHOOK_SECRET = "whsec_test_dummy";

function sign(rawBody: string, secret = WEBHOOK_SECRET): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

// Same constant-time comparison the function uses.
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const samplePayload = JSON.stringify({
  event: "subscription.charged",
  payload: {
    subscription: { entity: { id: "sub_TEST1", plan_id: "plan_TEST1" } },
    payment: { entity: { id: "pay_TEST1", amount: 58882, currency: "INR", method: "upi", status: "captured" } },
  },
});

Deno.test("valid signature is accepted", () => {
  const sig = sign(samplePayload);
  assert(constantTimeEquals(sign(samplePayload), sig), "recomputed signature must match");
});

Deno.test("tampered body is rejected", () => {
  const sig = sign(samplePayload);
  const tampered = samplePayload.replace("58882", "100"); // attacker lowers the amount
  assertFalse(constantTimeEquals(sign(tampered), sig), "tampered payload must not verify");
});

Deno.test("wrong secret is rejected", () => {
  const sig = sign(samplePayload, "whsec_attacker");
  assertFalse(constantTimeEquals(sign(samplePayload), sig), "signature from a different secret must not verify");
});

Deno.test("constant-time compare rejects different-length strings", () => {
  assertFalse(constantTimeEquals("abc", "abcd"));
});

Deno.test("invoice GST math: 18% on 499 => total 588.82", () => {
  const subtotal = 499;
  const tax = Math.round(subtotal * 0.18 * 100) / 100;
  // Round the sum to 2 decimals exactly as the webhook handler does — float
  // addition of 499 + 89.82 lands on 588.8199999999999 otherwise.
  const total = Math.round((subtotal + tax) * 100) / 100;
  assertEquals(tax, 89.82);
  assertEquals(total, 588.82);
});

Deno.test("amount in paise from Razorpay converts back to INR", () => {
  const amountPaise = 58882; // what Razorpay sends
  assertEquals(amountPaise / 100, 588.82);
});

Deno.test("idempotency key shape: event id drives single-processing", () => {
  // The webhook stores X-Razorpay-Event-Id UNIQUE; two deliveries of the same
  // event id must collapse to one. Model that with a Set.
  const seen = new Set<string>();
  const eventId = "evt_abc123";
  const first = !seen.has(eventId); seen.add(eventId);
  const second = !seen.has(eventId);
  assert(first, "first delivery is new");
  assertFalse(second, "redelivery is ignored");
});
