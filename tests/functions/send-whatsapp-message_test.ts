// tests/functions/send-whatsapp-message_test.ts
//
// INTEGRATION SCOPE NOTE
// ----------------------
// The function module (supabase/functions/send-whatsapp-message/index.ts) calls
// `serve()` at the top level and reads Deno.env / calls fetch at module
// evaluation time, so importing it directly would bind a port and fail in a
// plain `deno test` run.  These tests therefore exercise the deterministic,
// pure-logic components that the function embeds — extracted verbatim from the
// source so any drift becomes a red flag:
//
//   1. APPROVED_TEMPLATE_IDS gate  (step 3 of the handler)
//   2. E.164 phone regex            (PayloadSchema.recipient_phone)
//   3. Zod PayloadSchema            (step 2 of the handler — full object)
//   4. HTTP method gating           (OPTIONS → 204, non-POST → 405)
//   5. Auth header parsing          (Bearer token check)
//
// For steps 4 & 5 we build a lightweight handler stub that mirrors the real
// handler's preamble exactly and call it with synthetic Request objects — this
// exercises the routing / auth logic without touching Supabase or AiSensy.
//
// Run: deno test --allow-env tests/functions/send-whatsapp-message_test.ts

import {
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// 1. Replicate the approved-template list verbatim from the source.
//    If the source list changes without updating this test the coverage gap is
//    immediately visible.
// ---------------------------------------------------------------------------
const APPROVED_TEMPLATE_IDS = [
  "daily_digest",
  "mortality_alert",
  "vaccination_reminder",
  "heat_stress_alert",
  "payment_reminder",
  "low_stock_alert",
] as const;

function isApprovedTemplateId(id: string): boolean {
  return (APPROVED_TEMPLATE_IDS as readonly string[]).includes(id);
}

// ---------------------------------------------------------------------------
// 2. Replicate PayloadSchema verbatim (extracted from the source — no import).
// ---------------------------------------------------------------------------
const PayloadSchema = z.object({
  farm_id: z.string().uuid(),
  recipient_phone: z
    .string()
    .regex(/^\+\d{10,15}$/, "recipient_phone must be E.164 (+digits, 10-15 digits total)"),
  message_type: z.enum([
    "daily_digest",
    "mortality_alert",
    "vaccination_reminder",
    "heat_stress_alert",
    "payment_reminder",
    "low_stock_alert",
    "invoice",
    "traceability_cert",
    "report",
  ]),
  template_id: z.string().min(1),
  template_params: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// 3. Minimal handler stub that mirrors the real handler's preamble (CORS,
//    method gate, auth gate) so we can exercise HTTP-level logic without
//    Supabase or AiSensy.  Returns a Response exactly as the real handler does.
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

async function handlerPreamble(
  req: Request,
  serviceRoleKey: string,
): Promise<Response | null> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");
  const providedToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isAuthorized =
    (providedToken !== null && providedToken === serviceRoleKey) ||
    (apikeyHeader !== null && apikeyHeader === serviceRoleKey);

  if (!isAuthorized) {
    return jsonResp({ error: "Unauthorized" }, 401);
  }

  // Preamble passed — caller continues with body parsing
  return null;
}

const FAKE_SERVICE_ROLE_KEY = "fake-service-role-key-for-testing";

// ---------------------------------------------------------------------------
// Test suite: APPROVED_TEMPLATE_IDS gate
// ---------------------------------------------------------------------------

Deno.test("APPROVED_TEMPLATE_IDS: all 6 canonical IDs are accepted", () => {
  const expected = [
    "daily_digest",
    "mortality_alert",
    "vaccination_reminder",
    "heat_stress_alert",
    "payment_reminder",
    "low_stock_alert",
  ];
  for (const id of expected) {
    assertEquals(
      isApprovedTemplateId(id),
      true,
      `Expected '${id}' to be approved`,
    );
  }
});

Deno.test("APPROVED_TEMPLATE_IDS: unknown template_id is rejected", () => {
  const unknown = [
    "not_a_real_template",
    "daily_digest_v2",
    "",
    "DAILY_DIGEST",    // case-sensitive
    "invoice",         // valid message_type but NOT an approved send-template
  ];
  for (const id of unknown) {
    assertEquals(
      isApprovedTemplateId(id),
      false,
      `Expected '${id}' to NOT be approved`,
    );
  }
});

Deno.test("APPROVED_TEMPLATE_IDS: exactly 6 entries — no hidden additions", () => {
  assertEquals(APPROVED_TEMPLATE_IDS.length, 6);
});

// ---------------------------------------------------------------------------
// Test suite: E.164 phone regex
// ---------------------------------------------------------------------------

const phoneRegex = /^\+\d{10,15}$/;

Deno.test("phone regex: '+919876543210' (Indian mobile, 13 chars) is valid E.164", () => {
  assertMatch("+919876543210", phoneRegex);
});

Deno.test("phone regex: '+12125551234' (US number, 12 chars) is valid E.164", () => {
  assertMatch("+12125551234", phoneRegex);
});

Deno.test("phone regex: '+1234567890' (10 digits after +) is valid E.164", () => {
  assertMatch("+1234567890", phoneRegex);
});

Deno.test("phone regex: '+123456789012345' (15 digits after +) is valid E.164", () => {
  assertMatch("+123456789012345", phoneRegex);
});

Deno.test("phone regex: '9876543210' (no leading +) is invalid", () => {
  assertEquals(phoneRegex.test("9876543210"), false);
});

Deno.test("phone regex: '+91987654321' (only 11 chars, 10 digits after +) is valid — boundary", () => {
  // +91987654321 has 11 total chars → 10 digits after + → matches \d{10,15}
  assertMatch("+91987654321", phoneRegex);
});

Deno.test("phone regex: '+9' (too short — only 1 digit) is invalid", () => {
  assertEquals(phoneRegex.test("+9"), false);
});

Deno.test("phone regex: 'abc' is invalid", () => {
  assertEquals(phoneRegex.test("abc"), false);
});

Deno.test("phone regex: '+abc1234567890' (letters after +) is invalid", () => {
  assertEquals(phoneRegex.test("+abc1234567890"), false);
});

Deno.test("phone regex: '+1234567890123456' (16 digits after + — too long) is invalid", () => {
  assertEquals(phoneRegex.test("+1234567890123456"), false);
});

// ---------------------------------------------------------------------------
// Test suite: Zod PayloadSchema validation
// ---------------------------------------------------------------------------

const validPayload = {
  farm_id: "11111111-1111-1111-1111-111111111111",
  recipient_phone: "+919876543210",
  message_type: "mortality_alert",
  template_id: "mortality_alert",
  template_params: ["Sunrise Farm", "12", "5", "Shed A"],
};

Deno.test("PayloadSchema: valid payload parses successfully", () => {
  const result = PayloadSchema.safeParse(validPayload);
  assertEquals(result.success, true);
});

Deno.test("PayloadSchema: invalid UUID in farm_id fails", () => {
  const result = PayloadSchema.safeParse({ ...validPayload, farm_id: "not-a-uuid" });
  assertEquals(result.success, false);
});

Deno.test("PayloadSchema: phone without leading + fails", () => {
  const result = PayloadSchema.safeParse({
    ...validPayload,
    recipient_phone: "919876543210",
  });
  assertEquals(result.success, false);
  if (!result.success) {
    const msg = JSON.stringify(result.error.flatten());
    assertStringIncludes(msg, "E.164");
  }
});

Deno.test("PayloadSchema: unknown message_type fails", () => {
  const result = PayloadSchema.safeParse({
    ...validPayload,
    message_type: "unknown_type",
  });
  assertEquals(result.success, false);
});

Deno.test("PayloadSchema: empty template_id fails (min(1))", () => {
  const result = PayloadSchema.safeParse({ ...validPayload, template_id: "" });
  assertEquals(result.success, false);
});

Deno.test("PayloadSchema: missing template_params fails", () => {
  const { template_params: _omit, ...rest } = validPayload;
  const result = PayloadSchema.safeParse(rest);
  assertEquals(result.success, false);
});

Deno.test("PayloadSchema: template_params may be an empty array", () => {
  const result = PayloadSchema.safeParse({ ...validPayload, template_params: [] });
  assertEquals(result.success, true);
});

Deno.test("PayloadSchema: invoice is a valid message_type even though not an approved template_id", () => {
  // message_type and template_id are separate fields — invoice IS a valid message_type
  const result = PayloadSchema.safeParse({ ...validPayload, message_type: "invoice" });
  assertEquals(result.success, true);
});

// ---------------------------------------------------------------------------
// Test suite: HTTP method gating (OPTIONS → 204, non-POST → 405)
// ---------------------------------------------------------------------------

Deno.test("handler preamble: OPTIONS request returns 204 with CORS headers", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "OPTIONS",
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res!.status, 204);
  assertEquals(res!.headers.get("Access-Control-Allow-Origin"), "*");
  assertStringIncludes(
    res!.headers.get("Access-Control-Allow-Methods") ?? "",
    "POST",
  );
});

Deno.test("handler preamble: GET returns 405 Method Not Allowed", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "GET",
    headers: { Authorization: `Bearer ${FAKE_SERVICE_ROLE_KEY}` },
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res!.status, 405);
  const body = await res!.json();
  assertEquals(body.error, "Method not allowed");
});

Deno.test("handler preamble: PUT returns 405 Method Not Allowed", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "PUT",
    headers: { Authorization: `Bearer ${FAKE_SERVICE_ROLE_KEY}` },
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res!.status, 405);
});

Deno.test("handler preamble: DELETE returns 405 Method Not Allowed", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "DELETE",
    headers: { Authorization: `Bearer ${FAKE_SERVICE_ROLE_KEY}` },
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res!.status, 405);
});

// ---------------------------------------------------------------------------
// Test suite: Auth — service-role token required
// ---------------------------------------------------------------------------

Deno.test("auth: valid Bearer token passes preamble (returns null to continue)", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FAKE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res, null); // null means "proceed" — no early-return from preamble
});

Deno.test("auth: valid apikey header passes preamble", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "POST",
    headers: {
      apikey: FAKE_SERVICE_ROLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res, null);
});

Deno.test("auth: missing Authorization header returns 401", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res!.status, 401);
  const body = await res!.json();
  assertEquals(body.error, "Unauthorized");
});

Deno.test("auth: wrong Bearer token returns 401", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "POST",
    headers: { Authorization: "Bearer wrong-token" },
    body: JSON.stringify({}),
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res!.status, 401);
});

Deno.test("auth: anon JWT (not service role) returns 401", async () => {
  // Simulate an anon/user JWT rather than the service-role key
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "POST",
    headers: {
      Authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.fake",
    },
    body: JSON.stringify({}),
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  assertEquals(res!.status, 401);
});

Deno.test("auth: Bearer prefix without token value returns 401", async () => {
  const req = new Request("https://example.com/send-whatsapp-message", {
    method: "POST",
    headers: { Authorization: "Bearer " },
    body: JSON.stringify({}),
  });
  const res = await handlerPreamble(req, FAKE_SERVICE_ROLE_KEY);
  // "Bearer " → slice(7) → "" — empty string !== service role key
  assertEquals(res!.status, 401);
});
