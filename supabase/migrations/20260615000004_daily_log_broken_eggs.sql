-- =============================================================================
-- PoultryOS — Daily log: broken/cracked eggs capture (layer morning-ops)
-- File: 20260615000004_daily_log_broken_eggs.sql
-- Created: 2026-06-15
-- =============================================================================
-- Layer farms track broken/cracked eggs as a primary quality + loss metric, but
-- daily_logs only had a single gross `eggs_collected`. Add a nullable
-- `broken_eggs` count so the type-aware morning-ops form can capture it for
-- layer/breeder batches. Gross eggs stay in eggs_collected; broken is a subset
-- recorded for spoilage/quality tracking.
-- =============================================================================

BEGIN;

ALTER TABLE public.daily_logs
  ADD COLUMN IF NOT EXISTS broken_eggs INTEGER;

ALTER TABLE public.daily_logs
  DROP CONSTRAINT IF EXISTS daily_logs_broken_eggs_chk;
ALTER TABLE public.daily_logs
  ADD CONSTRAINT daily_logs_broken_eggs_chk
  CHECK (broken_eggs IS NULL OR broken_eggs >= 0);

COMMENT ON COLUMN public.daily_logs.broken_eggs IS
  'Broken/cracked eggs for the day (layer/breeder). Subset of eggs_collected; nullable.';

COMMIT;
