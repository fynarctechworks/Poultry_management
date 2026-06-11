// supabase/functions/send-payment-reminders/index.ts
// Called by:
//   1. pg_cron daily at 04:30 UTC (10:00 IST) via net.http_post
//      Migration: 20260519000008_schedule_payment_reminders.sql
//
// Auth: service-role Bearer token only (no user JWT accepted).
//
// Logic:
//   1. Call public.check_payment_overdue() — returns rows for overdue
//      financial_transactions whose days_overdue puts them at the day_7,
//      day_15, or day_30 reminder stage.
//   2. For each row: fetch buyer phone + farm name, then call
//      send-whatsapp-message with template_id='payment_reminder'.
//   3. Insert one payment_reminders audit row per WhatsApp send.
//   4. Continue on per-row failure (warn, don't throw).
//   5. Return { reminders_sent, total_overdue }.
//
// Template used (payment_reminder):
//   "Reminder: ₹{{1}} pending from {{2}}. Pay via UPI: {{3}}"
//   Params: [amount, buyer_name, vpa_or_blank]

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface OverdueRow {
  transaction_id: string;
  farm_id: string;
  buyer_id: string;
  amount: number;
  due_date: string;
  days_overdue: number;
  reminder_stage: "day_7" | "day_15" | "day_30";
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // Auth — service role only
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");
  const providedToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isAuthorized =
    (providedToken && providedToken === serviceRoleKey) ||
    (apikeyHeader && apikeyHeader === serviceRoleKey);
  if (!isAuthorized) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // 1. Pull overdue rows from the DB function
  const { data: overdueData, error: overdueError } = await supabase.rpc(
    "check_payment_overdue",
  );

  if (overdueError) {
    console.error("check_payment_overdue error:", overdueError.message);
    return jsonResponse(
      { error: "Failed to query overdue payments", details: overdueError.message },
      500,
    );
  }

  const overdueRows = (overdueData ?? []) as OverdueRow[];
  const total_overdue = overdueRows.length;

  if (total_overdue === 0) {
    return jsonResponse({ reminders_sent: 0, total_overdue: 0 });
  }

  const whatsappUrl = `${supabaseUrl}/functions/v1/send-whatsapp-message`;
  let reminders_sent = 0;

  for (const row of overdueRows) {
    try {
      // Skip if we already sent this stage for this transaction
      const { data: existing } = await supabase
        .from("payment_reminders")
        .select("id")
        .eq("transaction_id", row.transaction_id)
        .eq("reminder_stage", row.reminder_stage)
        .maybeSingle();
      if (existing) {
        continue;
      }

      // Fetch buyer + farm for the message
      const [buyerRes, farmRes] = await Promise.all([
        supabase
          .from("buyers")
          .select("buyer_name, whatsapp_phone, phone")
          .eq("id", row.buyer_id)
          .maybeSingle(),
        supabase
          .from("farms")
          .select("farm_name, upi_id")
          .eq("id", row.farm_id)
          .maybeSingle(),
      ]);

      const buyer = buyerRes.data;
      const farm = farmRes.data;
      const recipientPhone =
        buyer?.whatsapp_phone?.trim() || buyer?.phone?.trim() || "";

      if (!buyer || !recipientPhone) {
        console.warn(
          `Skipping ${row.reminder_stage} for transaction ${row.transaction_id}: no buyer phone`,
        );
        continue;
      }

      const amountStr = Number(row.amount).toLocaleString("en-IN", {
        maximumFractionDigits: 2,
      });
      const vpaStr = farm?.upi_id?.trim() || "—";

      const waRes = await fetch(whatsappUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          farm_id: row.farm_id,
          recipient_phone: recipientPhone,
          message_type: "payment_reminder",
          template_id: "payment_reminder",
          template_params: [amountStr, buyer.buyer_name, vpaStr],
        }),
      });

      let waLogId: string | null = null;
      let status: "sent" | "failed" = "failed";

      if (waRes.ok) {
        const waJson: { sent?: boolean; log_id?: string } = await waRes
          .json()
          .catch(() => ({}));
        waLogId = waJson.log_id ?? null;
        if (waJson.sent === true) {
          status = "sent";
          reminders_sent++;
        }
      } else {
        const errText = await waRes.text().catch(() => `HTTP ${waRes.status}`);
        console.warn(
          `send-whatsapp-message error for transaction ${row.transaction_id}: ${waRes.status} — ${errText}`,
        );
      }

      // Audit row in payment_reminders
      const { error: prError } = await supabase
        .from("payment_reminders")
        .insert({
          farm_id: row.farm_id,
          buyer_id: row.buyer_id,
          transaction_id: row.transaction_id,
          reminder_stage: row.reminder_stage,
          whatsapp_message_id: waLogId,
          status,
        });
      if (prError) {
        console.warn(
          `payment_reminders insert failed for ${row.transaction_id}:`,
          prError.message,
        );
      }
    } catch (err) {
      console.warn(`Error processing overdue row ${row.transaction_id}:`, err);
    }
  }

  return jsonResponse({ reminders_sent, total_overdue });
});
