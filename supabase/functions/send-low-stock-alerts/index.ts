// supabase/functions/send-low-stock-alerts/index.ts
// Called by:
//   1. pg_cron daily at 03:00 UTC (08:30 IST) via net.http_post
//
// Auth: service-role Bearer token only (no user JWT accepted).
//
// Logic:
//   1. Query inventory_items for all farms (service role bypasses RLS).
//      Filter in JS: low_stock_threshold > 0 AND current_stock <= low_stock_threshold.
//   2. Group low-stock items by farm_id.
//   3. Fire ONE push notification per farm via send-push-notification.
//   4. Return { farms_notified, items_low }.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

// Row returned from the inventory_items query
const InventoryItemSchema = z.object({
  id: z.string().uuid(),
  farm_id: z.string().uuid(),
  item_name: z.string(),
  category: z.string(),
  unit: z.string(),
  current_stock: z.number(),
  low_stock_threshold: z.number(),
});

type InventoryItem = z.infer<typeof InventoryItemSchema>;

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
  // 1. Auth — service role only (mirrors send-vaccination-reminders verbatim)
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
  // 3. Query all inventory_items (no .eq filter — service role sees all farms).
  //    Supabase JS cannot compare two columns server-side, so fetch all rows
  //    and filter in JS: low_stock_threshold > 0 AND current_stock <= low_stock_threshold.
  // ---------------------------------------------------------------------------
  const { data: allItems, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id, farm_id, item_name, category, unit, current_stock, low_stock_threshold");

  if (itemsError) {
    console.error("Inventory query error:", itemsError.message);
    return new Response(
      JSON.stringify({
        error: "Failed to query inventory items",
        details: itemsError.message,
      }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // Filter in JS: threshold must be positive and current stock at or below it
  const lowItems: InventoryItem[] = ((allItems as unknown as InventoryItem[]) ?? [])
    .filter(
      (item) =>
        item.low_stock_threshold > 0 &&
        item.current_stock <= item.low_stock_threshold,
    );

  const items_low = lowItems.length;

  if (items_low === 0) {
    return new Response(
      JSON.stringify({ farms_notified: 0, items_low: 0 }),
      { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  // ---------------------------------------------------------------------------
  // 4. Group by farm_id
  // ---------------------------------------------------------------------------
  const byFarm = new Map<string, InventoryItem[]>();
  for (const item of lowItems) {
    const existing = byFarm.get(item.farm_id) ?? [];
    existing.push(item);
    byFarm.set(item.farm_id, existing);
  }

  // ---------------------------------------------------------------------------
  // 5. Send one push notification per farm
  // ---------------------------------------------------------------------------
  const pushUrl = `${supabaseUrl}/functions/v1/send-push-notification`;
  let farms_notified = 0;

  for (const [farm_id, items] of byFarm.entries()) {
    let title: string;
    let body: string;

    if (items.length === 1) {
      const item = items[0];
      title = "Low stock alert";
      body = `${item.item_name} is low: ${item.current_stock} ${item.unit} left`;
    } else {
      title = "Low stock alert";
      body = `${items.length} inventory items are running low. Tap to review.`;
    }

    const item_ids = items.map((item) => item.id);

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
            type: "low_stock_alert",
            farm_id,
            item_ids,
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
  // 6. Return summary
  // ---------------------------------------------------------------------------
  return new Response(
    JSON.stringify({ farms_notified, items_low }),
    { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
});
