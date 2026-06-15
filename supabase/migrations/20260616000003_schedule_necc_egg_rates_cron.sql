-- Phase 4.2 — Schedule the NECC zonal egg-rate fetch.
--
-- Runs daily at 08:00 IST (02:30 UTC), shortly after NECC declares the day's
-- rates. Uses the same app.edge_function_base_url / app.edge_function_service_key
-- settings as every other cron job (see 20260519000007_schedule_daily_digest.sql).
-- The Edge Function is resilient: if NECC_RATES_URL is unset/unreachable it
-- no-ops, so this job never errors and the apps fall back gracefully.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-necc-egg-rates-daily') THEN
    PERFORM cron.unschedule('fetch-necc-egg-rates-daily');
  END IF;
END
$$;

-- 30 2 * * * = 02:30 UTC = 08:00 IST daily
SELECT cron.schedule(
  'fetch-necc-egg-rates-daily',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.edge_function_base_url') || '/fetch-necc-egg-rates',
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
