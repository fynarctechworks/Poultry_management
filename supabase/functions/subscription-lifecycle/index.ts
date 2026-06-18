// supabase/functions/subscription-lifecycle/index.ts
//
// Renewal-reminder dispatcher, invoked daily by pg_cron (after the SQL
// transitions in process_subscription_lifecycle have run). Reads the
// reminders that are due today (7 / 3 / 1 / 0 days before renewal) and sends an
// in-app push to the tenant's farm, then records an idempotent reminder row.
//
// WhatsApp is intentionally NOT sent here: the 6 Meta-approved AiSensy templates
// are all operational (digest, alerts, buyer payment) — a dedicated
// `subscription_renewal` template must be approved before we can message owners
// on WhatsApp. Until then, push + the in-app banner carry renewal reminders.
//
// Auth: service-role (called by cron). Body: {} (ignored).
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchEmail, resolveTenantOwnerEmail } from "../_shared/send-email-client.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

interface Reminder {
  tenant_id: string; subscription_id: string; stage: string; period_end: string;
  days_remaining: number; plan_name: string; amount_inr: number;
}

function reminderCopy(r: Reminder): { title: string; body: string } {
  const amt = `₹${Number(r.amount_inr ?? 0).toLocaleString("en-IN")}`;
  if (r.days_remaining <= 0) {
    return { title: "Subscription expired", body: `Your ${r.plan_name} plan has expired. Renew now to restore editing — your data is safe.` };
  }
  const d = r.days_remaining === 1 ? "1 day" : `${r.days_remaining} days`;
  return { title: `Renewal in ${d}`, body: `Your ${r.plan_name} plan (${amt}) renews in ${d}. Keep your farm running without interruption.` };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  const { data: reminders, error } = await svc.rpc("get_pending_subscription_reminders");
  if (error) return json({ ok: false, error: error.message }, 500);

  let sent = 0;
  for (const r of (reminders ?? []) as Reminder[]) {
    // Pick any farm in the tenant to target the push (send-push-notification is farm-scoped).
    const { data: farm } = await svc.from("farms").select("id").eq("tenant_id", r.tenant_id).limit(1).maybeSingle();
    let pushed = false;
    if (farm?.id) {
      const { title, body } = reminderCopy(r);
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
          body: JSON.stringify({ farm_id: farm.id, title, body, data: { type: "subscription_reminder", stage: r.stage } }),
        });
        pushed = res.ok;
      } catch (e) { console.warn("push failed:", e); }
    }
    // Email dispatch alongside push — owner email comes from auth.users via the
    // tenant owner. Best-effort; email failure must not block the reminder record.
    const ownerEmail = await resolveTenantOwnerEmail(r.tenant_id);
    if (ownerEmail) {
      const amt = `₹${Number(r.amount_inr ?? 0).toLocaleString("en-IN")}`;
      if (r.days_remaining <= 0) {
        await dispatchEmail({
          recipient_email: ownerEmail,
          email_type: "subscription_expired",
          template_id: "subscription_expired",
          tenant_id: r.tenant_id,
          template_data: { planName: r.plan_name },
        });
      } else {
        const d = r.days_remaining === 1 ? "in 1 day" : `in ${r.days_remaining} days`;
        await dispatchEmail({
          recipient_email: ownerEmail,
          email_type: "trial_expiring",
          template_id: "trial_expiring",
          tenant_id: r.tenant_id,
          template_data: { planName: r.plan_name, endsIn: d, amount: amt },
        });
      }
    }

    await svc.rpc("record_subscription_reminder", {
      p_tenant: r.tenant_id, p_subscription: r.subscription_id, p_stage: r.stage,
      p_period_end: r.period_end, p_push: pushed, p_whatsapp: false,
    });
    sent++;
  }

  return json({ ok: true, reminders_processed: sent });
});
