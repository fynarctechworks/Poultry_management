-- =============================================================================
-- PoultryOS — Low stock alerts cron schedule migration
-- File: 20260519000006_schedule_low_stock_alerts.sql
-- Created: 2026-05-19
-- Purpose: Schedule send-low-stock-alerts Edge Function daily at 08:30 IST.
--
-- Cron schedule: 0 3 * * * = 03:00 UTC daily = 08:30 IST (Asia/Kolkata)
-- CLAUDE.md spec: "send-low-stock-alerts — pg_cron daily 08:30 IST"
--
-- Prerequisites:
--   pg_cron and pg_net extensions must be enabled (done in initial_schema).
--
--   TWO database settings must be configured before the cron job can fire.
--   These are the SAME settings used by existing cron jobs and DB triggers:
--     app.edge_function_base_url   — base URL of Edge Functions (no trailing slash, no /v1/xxx)
--     app.edge_function_service_key — service role JWT
--
--   Check current values:
--     SELECT current_setting('app.edge_function_base_url', true)    AS base_url,
--            CASE WHEN current_setting('app.edge_function_service_key', true) IS NULL
--                 THEN 'NOT SET' ELSE 'SET' END                       AS service_key_set;
--
--   If NULL, run (in Supabase dashboard → SQL editor, or via MCP execute_sql):
--     ALTER DATABASE postgres SET app.edge_function_base_url    = 'https://jusxngbfdmzhlybohell.supabase.co/functions/v1';
--     ALTER DATABASE postgres SET app.edge_function_service_key = '<your-service-role-jwt>';
--
--   This aligns with the setting names established in 20260502000000_initial_schema.sql.
--   The trigger function tg_post_to_edge_function and the fetch-weather-data-every-4h
--   cron job use the same settings — configure once, all jobs work.
--
--   Note: ALTER DATABASE changes are not transaction-scoped — they persist across sessions.
-- =============================================================================

BEGIN;

-- Remove any existing schedule with this name (idempotent re-runs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-low-stock-alerts-daily') THEN
    PERFORM cron.unschedule('send-low-stock-alerts-daily');
  END IF;
END
$$;

-- Schedule: 0 3 * * * = 03:00 UTC = 08:30 IST (Asia/Kolkata) daily
SELECT cron.schedule(
  'send-low-stock-alerts-daily',
  '0 3 * * *',  -- 03:00 UTC = 08:30 IST (Asia/Kolkata) daily
  $$
  SELECT net.http_post(
    url := current_setting('app.edge_function_base_url') || '/send-low-stock-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.edge_function_service_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

COMMIT;
