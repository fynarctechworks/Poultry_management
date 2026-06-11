// supabase/functions/send-vaccination-reminders/index.ts
// Called by:
//   1. pg_cron daily at 01:30 UTC (07:00 IST) via net.http_post
//
// Auth: service-role Bearer token only (no user JWT accepted).
//
// Logic:
//   1. Mark overdue: UPDATE vaccinations SET status='overdue'
//      WHERE status='scheduled' AND scheduled_date < current_date.
//   2. Query vaccinations due in [today, today+2] joined to active batches.
//   3. Group by farm_id; fire one push notification per farm via
//      send-push-notification (direct payload shape).
//   4. Return { overdue_marked, farms_notified, vaccinations_due }.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// Row returned from the due-vaccinations query
const VaccinationRowSchema = z.object({
  id: z.string().uuid(),
  vaccine_name: z.string(),
  scheduled_date: z.string(), // DATE as ISO string
  farm_id: z.string().uuid(),
  batch_code: z.string(),
});

type VaccinationRow = z.infer<typeof VaccinationRowSchema>;

// ---------------------------------------------------------------------------
// CORS headers — mirror send-push-notification exactly
// ---------------------------------------------------------------------------
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Format a DATE ISO string to DD-MMM-YYYY (India-standard display). */
function formatDate(iso: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const d = new Date(iso + "T00:00:00Z"); // force UTC parse of date-only
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mmm = months[d.getUTCMonth()];
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mmm}-${yyyy}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ---------------------------------------------------------------------------
  // 1. Auth — service role only (mirrors send-push-notification verbatim)
  // ---------------------------------------------------------------------------
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization");
  const apikeyHeader = req.headers.get("apikey");

  const providedToken =
    authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isAuthorized =
    (providedToken && providedToken === serviceRoleKey) ||
    (apikeyHeader && apikeyHeader === serviceRoleKey);

  if (!isAuthorized) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // ---------------------------------------------------------------------------
  // 2. Service-role Supabase client
  // ---------------------------------------------------------------------------
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // ---------------------------------------------------------------------------
  // 3. Overdue sweep: mark scheduled vaccinations past their date as overdue
  // ---------------------------------------------------------------------------
  const { data: overdueData, error: overdueError } = await supabase
    .from("vaccinations")
    .update({ status: "overdue" })
    .eq("status", "scheduled")
    .lt("scheduled_date", new Date().toISOString().slice(0, 10)) // today (UTC)
    .select("id");

  if (overdueError) {
    console.error("Overdue sweep error:", overdueError.message);
    // Non-fatal: continue to notifications
  }

  const overdue_marked = overdueData?.length ?? 0;

  // ---------------------------------------------------------------------------
  // 4. Due-soon query: [today, today + 2 days], only active batches
  // ---------------------------------------------------------------------------
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const plusTwoStr = new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Join vaccinations → batches to get batch_code + confirm batch is active.
  // We pull only the columns we need; RLS is bypassed by the service role.
  const { data: dueRows, error: dueError } = await supabase
    .from("vaccinations")
    .select(
      "id, vaccine_name, scheduled_date, farm_id, batches!inner(batch_code, status)",
    )
    .in("status", ["scheduled", "overdue"])
    .gte("scheduled_date", todayStr)
    .lte("scheduled_date", plusTwoStr);

  if (dueError) {
    console.error("Due-vaccinations query error:", dueError.message);
    return new Response(
      JSON.stringify({
        error: "Failed to query due vaccinations",
        details: dueError.message,
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Filter to active batches only and normalise shape.
  // Supabase returns the foreign-table relation as an array even when using
  // !inner — we take index [0] since batch_id is a FK (one row guaranteed).
  type RawRow = {
    id: string;
    vaccine_name: string;
    scheduled_date: string;
    farm_id: string;
    batches: Array<{ batch_code: string; status: string }>;
  };

  const activeRows: VaccinationRow[] = ((dueRows as unknown as RawRow[]) ?? [])
    .filter((r) => Array.isArray(r.batches) && r.batches[0]?.status === "active")
    .map((r) => ({
      id: r.id,
      vaccine_name: r.vaccine_name,
      scheduled_date: r.scheduled_date,
      farm_id: r.farm_id,
      batch_code: r.batches[0].batch_code,
    }));

  const vaccinations_due = activeRows.length;

  if (vaccinations_due === 0) {
    return new Response(
      JSON.stringify({ overdue_marked, farms_notified: 0, vaccinations_due: 0 }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // ---------------------------------------------------------------------------
  // 5. Group by farm_id
  // ---------------------------------------------------------------------------
  const byFarm = new Map<string, VaccinationRow[]>();
  for (const row of activeRows) {
    const existing = byFarm.get(row.farm_id) ?? [];
    existing.push(row);
    byFarm.set(row.farm_id, existing);
  }

  // ---------------------------------------------------------------------------
  // 6. Send one push notification per farm
  // ---------------------------------------------------------------------------
  const pushUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
  let farms_notified = 0;

  for (const [farm_id, rows] of byFarm.entries()) {
    let title: string;
    let body: string;

    if (rows.length === 1) {
      const r = rows[0];
      title = "Vaccination due";
      body = `${r.vaccine_name} due ${formatDate(r.scheduled_date)} for batch ${r.batch_code}`;
    } else {
      title = "Vaccination due";
      body = `${rows.length} vaccinations due in the next 3 days. Tap to review.`;
    }

    const vaccination_ids = rows.map((r) => r.id);

    try {
      const pushRes = await fetch(pushUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          farm_id,
          title,
          body,
          data: {
            type: "vaccination_reminder",
            farm_id,
            vaccination_ids,
          },
          priority: "high",
        }),
      });

      if (!pushRes.ok) {
        const errText = await pushRes.text();
        console.warn(
          `Push failed for farm ${farm_id}: HTTP ${pushRes.status} — ${errText}`,
        );
        // Continue to next farm — per spec
      } else {
        farms_notified++;
      }
    } catch (err) {
      console.warn(`Network error sending push for farm ${farm_id}:`, err);
      // Continue to next farm
    }
  }

  // ---------------------------------------------------------------------------
  // 7. Return summary
  // ---------------------------------------------------------------------------
  return new Response(
    JSON.stringify({ overdue_marked, farms_notified, vaccinations_due }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
