-- Phase 4.3 — Weekly Farm Integrity report cron.
--
-- Monday 09:00 IST (03:30 UTC). Pushes the owner-only reconciliation summary.
-- Uses the same app.edge_function_base_url / app.edge_function_service_key
-- settings as the other cron jobs.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-farm-integrity-report-weekly') THEN
    PERFORM cron.unschedule('send-farm-integrity-report-weekly');
  END IF;
END
$$;

-- 30 3 * * 1 = 03:30 UTC Monday = 09:00 IST Monday
SELECT cron.schedule(
  'send-farm-integrity-report-weekly',
  '30 3 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.edge_function_base_url') || '/send-farm-integrity-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.edge_function_service_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

COMMIT;
