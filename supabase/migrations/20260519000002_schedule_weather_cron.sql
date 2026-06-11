-- =============================================================================
-- PoultryOS — Weather cron schedule migration
-- File: 20260519000002_schedule_weather_cron.sql
-- Created: 2026-05-19
-- Purpose: Schedule fetch-weather-data Edge Function every 4 hours via pg_cron.
--
-- Cron schedule: every 4 hours at minute 0 (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
-- IST equivalent: 05:30, 09:30, 13:30, 17:30, 21:30, 01:30 (next day)
--
-- This is 6 calls/day. At 160 farms = 960 OWM calls/day (within free-tier 1,000 limit).
-- Phase 2 enhancement: switch to hourly (0 * * * *) in Apr–Sep for active heat season.
--
-- Prerequisites:
--   pg_cron and pg_net extensions must be enabled (done in initial_schema).
--
--   TWO database settings must be configured before the cron job can fire.
--   These are the SAME settings used by the existing tg_post_to_edge_function trigger:
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
--   The trigger function tg_post_to_edge_function uses the same settings — configure once,
--   both DB triggers and cron jobs work.
--
--   Note: ALTER DATABASE changes are not transaction-scoped — they persist across sessions.
-- =============================================================================

BEGIN;

-- =============================================================================
-- Part 1: Add UNIQUE constraint on weather_data.farm_id
-- Needed for UPSERT (ON CONFLICT farm_id DO UPDATE) in fetch-weather-data function.
-- The CLAUDE.md spec says "one row per farm" — enforce it at DB level.
-- =============================================================================
ALTER TABLE public.weather_data
  ADD CONSTRAINT weather_data_farm_id_unique UNIQUE (farm_id);

-- =============================================================================
-- Part 2: pg_cron schedule for fetch-weather-data
-- =============================================================================

-- Remove any existing schedule with this name (idempotent re-runs)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'fetch-weather-data-every-4h') THEN
    PERFORM cron.unschedule('fetch-weather-data-every-4h');
  END IF;
END
$$;

SELECT cron.schedule(
  'fetch-weather-data-every-4h',
  '0 */4 * * *',  -- Every 4 hours at :00 — 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC
                  -- IST: 05:30, 09:30, 13:30, 17:30, 21:30, 01:30 IST
  $$
  SELECT net.http_post(
    url := current_setting('app.edge_function_base_url') || '/fetch-weather-data',
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
