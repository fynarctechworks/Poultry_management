// supabase/functions/generate-invoice-pdf/index.ts
//
// Renders a tax invoice PDF for an `invoices` row and stores it in the private
// `invoices` storage bucket at <tenant_id>/<invoice_number>.pdf, then writes the
// path back to invoices.pdf_path and returns a 1-hour signed URL.
//
// Callable by:
//   * the razorpay-webhook (service role bearer) right after issuing an invoice
//   * an authenticated tenant owner to (re)download — RLS on `invoices` ensures
//     they can only read their own invoice, and we verify ownership before render.
//
// Body: { invoice_id }
// Env: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jsPDF } from "https://esm.sh/jspdf@2.5.2";

// Brand palette — mirrors DESIGN.md / theme tokens. Edge Functions run on Deno
// and can't import the web `theme/tokens.ts`, so these are named here rather than
// scattered as inline hex through the layout code. Keep in sync with tokens.ts.
const BRAND = {
  primary: "#7132f5",
  ink: "#101114",
  body: "#686b82",
  bodySoft: "#9497a9",
  mute: "#dedee5",
  success: "#149e61",
  warning: "#92400E",
} as const;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
}
const inr = (n: number) => "INR " + Number(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ddmmmyyyy = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  let body: { invoice_id?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  if (!body.invoice_id) return jsonResponse({ error: "invoice_id required" }, 400);

  // Authorize: service-role bearer (webhook) bypasses; otherwise verify the
  // caller can read this invoice via RLS (owner only).
  const isService = token === serviceRoleKey;
  if (!isService) {
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }, auth: { persistSession: false },
    });
    const { data: allowed } = await userClient.from("invoices").select("id").eq("id", body.invoice_id).maybeSingle();
    if (!allowed) return jsonResponse({ error: "Forbidden" }, 403);
  }

  const { data: inv, error } = await svc.from("invoices").select("*").eq("id", body.invoice_id).maybeSingle();
  if (error || !inv) return jsonResponse({ error: "Invoice not found" }, 404);
  const { data: items } = await svc.from("invoice_items").select("*").eq("invoice_id", inv.id).order("sort_order");
  const { data: tenant } = await svc.from("tenants").select("name").eq("id", inv.tenant_id).maybeSingle();
  const bp = (inv.billing_snapshot_json ?? {}) as Record<string, string>;

  // ---- Render -------------------------------------------------------------
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  let y = 56;

  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(BRAND.primary);
  doc.text("PoultryOS", 48, y);
  doc.setFontSize(14); doc.setTextColor(BRAND.ink);
  doc.text("TAX INVOICE", W - 48, y, { align: "right" });
  y += 18;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(BRAND.body);
  doc.text("Farm management SaaS", 48, y);
  doc.text(inv.invoice_number, W - 48, y, { align: "right" });
  y += 12; doc.text("Issued " + ddmmmyyyy(inv.issued_at), W - 48, y, { align: "right" });

  y += 28; doc.setDrawColor(BRAND.mute); doc.line(48, y, W - 48, y); y += 22;

  // Bill-to
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(BRAND.ink);
  doc.text("Billed to", 48, y);
  doc.setFont("helvetica", "normal"); doc.setTextColor(BRAND.body); doc.setFontSize(9);
  const billLines = [
    bp.billing_name || tenant?.name || "—",
    bp.company_name || "",
    [bp.address_line1, bp.address_line2].filter(Boolean).join(", "),
    [bp.city, bp.state, bp.postal_code].filter(Boolean).join(", "),
    bp.gstin ? "GSTIN: " + bp.gstin : "",
    bp.email || "",
  ].filter(Boolean);
  let by = y + 14; for (const l of billLines) { doc.text(l, 48, by); by += 12; }

  // Status + period (right column)
  doc.setFont("helvetica", "bold"); doc.setTextColor(BRAND.ink); doc.text("Status", W - 220, y);
  doc.setFont("helvetica", "normal"); doc.setTextColor(inv.status === "paid" ? BRAND.success : BRAND.warning);
  doc.text(String(inv.status).toUpperCase(), W - 48, y, { align: "right" });
  doc.setTextColor(BRAND.body);
  doc.text("Billing period", W - 220, y + 14);
  doc.text(`${ddmmmyyyy(inv.period_start)} – ${ddmmmyyyy(inv.period_end)}`, W - 48, y + 14, { align: "right" });
  if (inv.paid_at) { doc.text("Paid on", W - 220, y + 28); doc.text(ddmmmyyyy(inv.paid_at), W - 48, y + 28, { align: "right" }); }

  y = Math.max(by, y + 42) + 18;

  // Items table
  doc.setDrawColor(BRAND.mute); doc.line(48, y, W - 48, y); y += 16;
  doc.setFont("helvetica", "bold"); doc.setTextColor(BRAND.body); doc.setFontSize(8);
  doc.text("DESCRIPTION", 48, y); doc.text("AMOUNT", W - 48, y, { align: "right" }); y += 6;
  doc.line(48, y, W - 48, y); y += 16;
  doc.setFont("helvetica", "normal"); doc.setTextColor(BRAND.ink); doc.setFontSize(9);
  for (const it of items ?? []) {
    const lines = doc.splitTextToSize(it.description, W - 200);
    doc.text(lines, 48, y);
    doc.text(inr(it.amount_inr), W - 48, y, { align: "right" });
    y += 14 * lines.length + 6;
  }

  // Totals
  y += 8; doc.line(W - 260, y, W - 48, y); y += 16;
  const totalsRow = (label: string, val: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setTextColor(bold ? BRAND.ink : BRAND.body);
    doc.text(label, W - 260, y); doc.text(val, W - 48, y, { align: "right" }); y += 16;
  };
  totalsRow("Subtotal", inr(inv.subtotal_inr));
  if (Number(inv.discount_inr) > 0) totalsRow("Discount", "-" + inr(inv.discount_inr));
  totalsRow(`GST (${Number(inv.tax_rate_pct)}%)`, inr(inv.tax_inr));
  doc.line(W - 260, y - 6, W - 48, y - 6);
  totalsRow("Total", inr(inv.total_inr), true);

  // Footer
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(BRAND.bodySoft);
  doc.text("Thank you for using PoultryOS.  This is a computer-generated invoice.", 48, doc.internal.pageSize.getHeight() - 40);
  if (inv.razorpay_payment_id) doc.text("Payment ref: " + inv.razorpay_payment_id, 48, doc.internal.pageSize.getHeight() - 28);

  const pdfBytes = doc.output("arraybuffer");
  const path = `${inv.tenant_id}/${inv.invoice_number}.pdf`;
  const { error: upErr } = await svc.storage.from("invoices").upload(path, new Uint8Array(pdfBytes), {
    contentType: "application/pdf", upsert: true,
  });
  if (upErr) { console.error("upload failed:", upErr.message); return jsonResponse({ error: upErr.message }, 500); }

  await svc.from("invoices").update({ pdf_path: path, updated_at: new Date().toISOString() }).eq("id", inv.id);
  const { data: signed } = await svc.storage.from("invoices").createSignedUrl(path, 3600);

  return jsonResponse({ ok: true, invoice_id: inv.id, pdf_path: path, signed_url: signed?.signedUrl ?? null });
});
