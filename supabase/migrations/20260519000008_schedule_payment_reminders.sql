-- =============================================================================
-- PoultryOS — Payment reminders cron schedule migration
-- File: 20260519000008_schedule_payment_reminders.sql
-- Created: 2026-05-19
-- Purpose: Schedule send-payment-reminders Edge Function daily at 10:00 IST.
--
-- Cron schedule: 30 4 * * * = 04:30 UTC daily = 10:00 IST (Asia/Kolkata)
-- CLAUDE.md spec: "send-payment-reminders — pg_cron 10 AM IST daily.
--                  Day 7/15/30 overdue WhatsApp reminders"
--
-- Prerequisites:
--   pg_cron and pg_net extensions enabled (initial_schema).
--   DB settings app.edge_function_base_url + app.edge_function_service_key
--   configured (shared with all existing cron jobs).
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-payment-reminders-daily') THEN
    PERFORM cron.unschedule('send-payment-reminders-daily');
  END IF;
END
$$;

SELECT cron.schedule(
  'send-payment-reminders-daily',
  '30 4 * * *',  -- 04:30 UTC = 10:00 IST (Asia/Kolkata) daily
  $$
  SELECT net.http_post(
    url := current_setting('app.edge_function_base_url') || '/send-payment-reminders',
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
