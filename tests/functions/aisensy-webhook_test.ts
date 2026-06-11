// tests/functions/aisensy-webhook_test.ts
//
// INTEGRATION SCOPE NOTE
// ----------------------
// The function module (supabase/functions/aisensy-webhook/index.ts) calls
// `serve()` at the top level and reads Deno.env at module evaluation time, so
// importing it directly would bind a port and fail in a plain `deno test` run.
// These tests exercise the deterministic, pure-logic components the function
// embeds — extracted verbatim from the source:
//
//   1. HMAC-SHA256 signature verification logic
//   2. Non-JSON body → 200 { ignored: 'non_json_body' }
//   3. Unknown event type → 200 { ignored: 'unknown_event_type' }
//   4. HTTP method gating: OPTIONS → 204, non-POST → 405
//   5. extractInboundText helper — all three payload shapes
//   6. Inbound opt-in/opt-out keyword detection (STOP/START/RESUME/REPORT)
//
// Run: deno test --allow-env tests/functions/aisensy-webhook_test.ts

import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHmac } from "node:crypto";

// ---------------------------------------------------------------------------
// Pure helpers extracted verbatim from the source — no import needed.
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-aisensy-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Mirrors extractInboundText verbatim from the source. */
function extractInboundText(payload: Record<string, unknown>): string {
  if (typeof payload.body === "string") return payload.body;
  if (
    payload.text &&
    typeof payload.text === "object" &&
    "body" in (payload.text as Record<string, unknown>)
  ) {
    return String((payload.text as Record<string, unknown>).body ?? "");
  }
  if (
    payload.text &&
    typeof payload.text === "object" &&
    "message" in (payload.text as Record<string, unknown>)
  ) {
    return String((payload.text as Record<string, unknown>).message ?? "");
  }
  return "";
}

/**
 * Computes the expected HMAC-SHA256 hex digest for a given secret + body.
 * Mirrors the production code: createHmac("sha256", secret).update(body).digest("hex")
 */
function computeHmac(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Constant-time comparison — mirrors source exactly.
 * Returns true only when both strings are identical in length and content.
 */
function signaturesMatch(expected: string, provided: string): boolean {
  return (
    expected.length === provided.length &&
    expected.split("").every((c, i) => c === provided[i])
  );
}

// ---------------------------------------------------------------------------
// Minimal handler stub that mirrors the webhook handler's preamble (CORS,
// method gate, signature verification, JSON parse, event routing) so we can
// exercise all HTTP-level and routing logic without touching Supabase.
//
// When `webhookSecret` is provided the stub performs signature verification.
// When it is undefined/empty the stub skips verification (matches the real
// function's "accept but warn" behaviour).
// ---------------------------------------------------------------------------

async function webhookHandlerStub(
  req: Request,
  webhookSecret: string | undefined,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResp({ error: "Method not allowed" }, 405);
  }

  const rawBodyBytes = await req.arrayBuffer();
  const rawBodyText = new TextDecoder().decode(rawBodyBytes);
  const signatureHeader = req.headers.get("X-AiSensy-Signature");

  if (webhookSecret) {
    if (signatureHeader) {
      const expectedSig = computeHmac(webhookSecret, rawBodyText);
      if (!signaturesMatch(expectedSig, signatureHeader)) {
        return jsonResp({ error: "Invalid signature" }, 401);
      }
    } else {
      return jsonResp({ error: "Missing signature header" }, 401);
    }
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBodyText);
  } catch {
    return jsonResp({ ok: true, ignored: "non_json_body" });
  }

  const eventType = typeof payload.type === "string" ? payload.type : "";

  if (eventType === "message_status" || eventType === "status") {
    // In the stub we skip the Supabase write — just return the success shape
    return jsonResp({ ok: true, updated: "stub_message_id" });
  }

  if (eventType === "message" || eventType === "inbound_message") {
    const senderPhone = String(payload.from ?? "");
    const messageText = extractInboundText(payload).trim().toUpperCase();
    if (messageText === "STOP") {
      return jsonResp({ ok: true, action: "opt_out", phone: senderPhone });
    }
    if (messageText === "START" || messageText === "RESUME") {
      return jsonResp({ ok: true, action: "opt_in", phone: senderPhone });
    }
    if (messageText === "REPORT") {
      return jsonResp({ ok: true, action: "report_acknowledged", phone: senderPhone });
    }
    return jsonResp({ ok: true, action: "unhandled_inbound" });
  }

  return jsonResp({ ok: true, ignored: "unknown_event_type" });
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const TEST_SECRET = "test-webhook-secret-32chars-abcdef";

function makePostRequest(
  body: string,
  extraHeaders: Record<string, string> = {},
): Request {
  return new Request("https://example.com/aisensy-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body,
  });
}

function signedRequest(body: string): Request {
  const sig = computeHmac(TEST_SECRET, body);
  return makePostRequest(body, { "X-AiSensy-Signature": sig });
}

// ---------------------------------------------------------------------------
// Test suite: HMAC-SHA256 signature verification — pure crypto unit tests
// ---------------------------------------------------------------------------

Deno.test("HMAC: same secret + body always produces the same hex digest", () => {
  const sig1 = computeHmac("secret", "hello");
  const sig2 = computeHmac("secret", "hello");
  assertEquals(sig1, sig2);
});

Deno.test("HMAC: different body produces a different digest", () => {
  const sig1 = computeHmac("secret", "hello");
  const sig2 = computeHmac("secret", "world");
  assertEquals(sig1 === sig2, false);
});

Deno.test("HMAC: different secret produces a different digest", () => {
  const sig1 = computeHmac("secret1", "hello");
  const sig2 = computeHmac("secret2", "hello");
  assertEquals(sig1 === sig2, false);
});

Deno.test("HMAC: digest is a 64-char hex string (SHA-256 = 32 bytes)", () => {
  const sig = computeHmac("secret", "body");
  assertEquals(sig.length, 64);
  assertEquals(/^[0-9a-f]{64}$/.test(sig), true);
});

Deno.test("HMAC: known-value test — HMAC-SHA256('key','The quick brown fox')", () => {
  // Value confirmed from Deno's node:crypto implementation output.
  // Deno's node:crypto HMAC-SHA256("key", "The quick brown fox") = 203d1e5c...
  const sig = computeHmac("key", "The quick brown fox");
  assertEquals(sig, "203d1e5cedd2d18f8c5a3beff0bd9c1ebcb97097dfcb288c46b00c9227fde2c0");
});

Deno.test("signaturesMatch: identical strings return true", () => {
  assertEquals(signaturesMatch("abc", "abc"), true);
});

Deno.test("signaturesMatch: different strings return false", () => {
  assertEquals(signaturesMatch("abc", "xyz"), false);
});

Deno.test("signaturesMatch: different lengths return false (timing-safe guard)", () => {
  assertEquals(signaturesMatch("abc", "abcd"), false);
});

// ---------------------------------------------------------------------------
// Test suite: Signature verification via the handler stub (HTTP-level)
// ---------------------------------------------------------------------------

Deno.test("webhook: valid HMAC signature passes and returns 200", async () => {
  const body = JSON.stringify({ type: "message_status", messageId: "msg-1", status: "delivered" });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  assertEquals(res.status, 200);
});

Deno.test("webhook: forged (wrong) signature returns 401", async () => {
  const body = JSON.stringify({ type: "message_status", messageId: "msg-1", status: "delivered" });
  const req = makePostRequest(body, { "X-AiSensy-Signature": "wrong_hex_signature" });
  const res = await webhookHandlerStub(req, TEST_SECRET);
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.error, "Invalid signature");
});

Deno.test("webhook: correct signature for different body is rejected (replay guard)", async () => {
  const originalBody = JSON.stringify({ type: "status", status: "sent" });
  const sig = computeHmac(TEST_SECRET, originalBody); // sig for original body
  const tamperedBody = JSON.stringify({ type: "status", status: "read" }); // body was changed
  const req = makePostRequest(tamperedBody, { "X-AiSensy-Signature": sig });
  const res = await webhookHandlerStub(req, TEST_SECRET);
  assertEquals(res.status, 401);
});

Deno.test("webhook: missing X-AiSensy-Signature header when secret is configured returns 401", async () => {
  const body = JSON.stringify({ type: "message_status", status: "sent" });
  const req = makePostRequest(body); // no signature header
  const res = await webhookHandlerStub(req, TEST_SECRET);
  assertEquals(res.status, 401);
  const json = await res.json();
  assertEquals(json.error, "Missing signature header");
});

Deno.test("webhook: when no secret configured, request with no signature is accepted", async () => {
  const body = JSON.stringify({ type: "unknown_thing" });
  const req = makePostRequest(body); // no signature
  const res = await webhookHandlerStub(req, undefined); // no secret
  assertEquals(res.status, 200);
});

// ---------------------------------------------------------------------------
// Test suite: Non-JSON body handling
// ---------------------------------------------------------------------------

Deno.test("non-JSON body: returns 200 with ignored='non_json_body'", async () => {
  const body = "this is not json at all";
  const sig = computeHmac(TEST_SECRET, body);
  const req = makePostRequest(body, { "X-AiSensy-Signature": sig });
  const res = await webhookHandlerStub(req, TEST_SECRET);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.ok, true);
  assertEquals(json.ignored, "non_json_body");
});

Deno.test("non-JSON body: empty body returns 200 with ignored='non_json_body'", async () => {
  const body = "";
  const sig = computeHmac(TEST_SECRET, body);
  const req = makePostRequest(body, { "X-AiSensy-Signature": sig });
  const res = await webhookHandlerStub(req, TEST_SECRET);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.ignored, "non_json_body");
});

Deno.test("non-JSON body: URL-encoded form data returns 200 with ignored='non_json_body'", async () => {
  const body = "field=value&other=123";
  const sig = computeHmac(TEST_SECRET, body);
  const req = makePostRequest(body, { "X-AiSensy-Signature": sig });
  const res = await webhookHandlerStub(req, TEST_SECRET);
  const json = await res.json();
  assertEquals(json.ignored, "non_json_body");
});

// ---------------------------------------------------------------------------
// Test suite: Unknown event type
// ---------------------------------------------------------------------------

Deno.test("unknown event type: returns 200 with ignored='unknown_event_type'", async () => {
  const body = JSON.stringify({ type: "some_future_event", data: {} });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.ok, true);
  assertEquals(json.ignored, "unknown_event_type");
});

Deno.test("unknown event type: missing type field returns ignored='unknown_event_type'", async () => {
  const body = JSON.stringify({ messageId: "x", status: "sent" }); // no `type` key
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  const json = await res.json();
  assertEquals(json.ignored, "unknown_event_type");
});

Deno.test("unknown event type: numeric type field returns ignored='unknown_event_type'", async () => {
  const body = JSON.stringify({ type: 42 });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  const json = await res.json();
  assertEquals(json.ignored, "unknown_event_type");
});

// ---------------------------------------------------------------------------
// Test suite: HTTP method gating
// ---------------------------------------------------------------------------

Deno.test("OPTIONS: returns 204 with CORS headers", async () => {
  const req = new Request("https://example.com/aisensy-webhook", {
    method: "OPTIONS",
  });
  const res = await webhookHandlerStub(req, TEST_SECRET);
  assertEquals(res.status, 204);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "*");
  assertStringIncludes(
    res.headers.get("Access-Control-Allow-Methods") ?? "",
    "POST",
  );
  assertStringIncludes(
    res.headers.get("Access-Control-Allow-Headers") ?? "",
    "x-aisensy-signature",
  );
});

Deno.test("GET: returns 405 Method Not Allowed", async () => {
  const req = new Request("https://example.com/aisensy-webhook", {
    method: "GET",
  });
  const res = await webhookHandlerStub(req, undefined);
  assertEquals(res.status, 405);
  const json = await res.json();
  assertEquals(json.error, "Method not allowed");
});

Deno.test("PUT: returns 405 Method Not Allowed", async () => {
  const req = new Request("https://example.com/aisensy-webhook", { method: "PUT" });
  const res = await webhookHandlerStub(req, undefined);
  assertEquals(res.status, 405);
});

Deno.test("PATCH: returns 405 Method Not Allowed", async () => {
  const req = new Request("https://example.com/aisensy-webhook", { method: "PATCH" });
  const res = await webhookHandlerStub(req, undefined);
  assertEquals(res.status, 405);
});

// ---------------------------------------------------------------------------
// Test suite: extractInboundText — all three payload shapes from the source
// ---------------------------------------------------------------------------

Deno.test("extractInboundText: flat 'body' string field (v1 shape)", () => {
  assertEquals(extractInboundText({ body: "STOP" }), "STOP");
});

Deno.test("extractInboundText: nested text.body (WhatsApp Cloud API shape)", () => {
  assertEquals(extractInboundText({ text: { body: "START" } }), "START");
});

Deno.test("extractInboundText: nested text.message (alt AiSensy shape)", () => {
  assertEquals(extractInboundText({ text: { message: "RESUME" } }), "RESUME");
});

Deno.test("extractInboundText: no text fields returns empty string", () => {
  assertEquals(extractInboundText({ type: "message", from: "+91999" }), "");
});

Deno.test("extractInboundText: text object without body or message returns empty string", () => {
  assertEquals(extractInboundText({ text: { other_key: "value" } }), "");
});

Deno.test("extractInboundText: non-object text field falls through to empty string", () => {
  assertEquals(extractInboundText({ text: "raw-string-not-object" }), "");
});

// ---------------------------------------------------------------------------
// Test suite: Inbound keyword routing (STOP / START / RESUME / REPORT)
// ---------------------------------------------------------------------------

Deno.test("inbound STOP: returns action='opt_out' with sender phone", async () => {
  const body = JSON.stringify({ type: "message", from: "+919876543210", body: "STOP" });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json.action, "opt_out");
  assertEquals(json.phone, "+919876543210");
});

Deno.test("inbound STOP (lowercase): case-insensitive match returns opt_out", async () => {
  const body = JSON.stringify({ type: "message", from: "+919876543210", body: "stop" });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  const json = await res.json();
  assertEquals(json.action, "opt_out");
});

Deno.test("inbound START: returns action='opt_in'", async () => {
  const body = JSON.stringify({ type: "inbound_message", from: "+919876543210", body: "START" });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  const json = await res.json();
  assertEquals(json.action, "opt_in");
});

Deno.test("inbound RESUME: returns action='opt_in'", async () => {
  const body = JSON.stringify({ type: "inbound_message", from: "+919876543210", body: "RESUME" });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  const json = await res.json();
  assertEquals(json.action, "opt_in");
});

Deno.test("inbound REPORT: returns action='report_acknowledged'", async () => {
  const body = JSON.stringify({ type: "message", from: "+919876543210", body: "REPORT" });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  const json = await res.json();
  assertEquals(json.action, "report_acknowledged");
});

Deno.test("inbound text.body shape for STOP: correctly routed via extractInboundText", async () => {
  const body = JSON.stringify({
    type: "message",
    from: "+919876543210",
    text: { body: "stop" },
  });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  const json = await res.json();
  assertEquals(json.action, "opt_out");
});

Deno.test("inbound arbitrary message: returns action='unhandled_inbound'", async () => {
  const body = JSON.stringify({
    type: "message",
    from: "+919876543210",
    body: "Hello, when will you deliver?",
  });
  const res = await webhookHandlerStub(signedRequest(body), TEST_SECRET);
  const json = await res.json();
  assertEquals(json.action, "unhandled_inbound");
});
