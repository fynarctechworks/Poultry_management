-- =============================================================================
-- PoultryOS — Patch: fix check_payment_overdue WHERE clause
-- File: 20260504000000_fix_payment_overdue_filter.sql
-- Created: 2026-05-04
-- Problem: Original filter used `days_overdue IN (7, 15, 30)` which silently
--   drops any overdue transaction not exactly on those days (e.g. day 8, 16,
--   31). The NOT EXISTS dedup already prevents double-sends, so the outer
--   filter only needs to pass anything >= 7 with a non-null stage.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.check_payment_overdue()
RETURNS TABLE (
  transaction_id UUID,
  farm_id        UUID,
  buyer_id       UUID,
  amount         NUMERIC,
  due_date       DATE,
  days_overdue   INTEGER,
  reminder_stage TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH overdue AS (
    SELECT
      ft.id                            AS transaction_id,
      ft.farm_id,
      ft.buyer_id,
      ft.amount,
      ft.due_date,
      (CURRENT_DATE - ft.due_date)::INTEGER AS days_overdue,
      CASE
        WHEN (CURRENT_DATE - ft.due_date) >= 30 THEN 'day_30'
        WHEN (CURRENT_DATE - ft.due_date) >= 15 THEN 'day_15'
        WHEN (CURRENT_DATE - ft.due_date) >= 7  THEN 'day_7'
        ELSE NULL
      END AS reminder_stage
    FROM public.financial_transactions ft
    WHERE ft.payment_status IN ('pending', 'partial')
      AND ft.due_date IS NOT NULL
      AND ft.buyer_id IS NOT NULL
      AND ft.transaction_type = 'income'
      AND CURRENT_DATE > ft.due_date
  )
  SELECT
    o.transaction_id,
    o.farm_id,
    o.buyer_id,
    o.amount,
    o.due_date,
    o.days_overdue,
    o.reminder_stage
  FROM overdue o
  WHERE o.reminder_stage IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
        FROM public.payment_reminders pr
       WHERE pr.transaction_id = o.transaction_id
         AND pr.reminder_stage = o.reminder_stage
    );
END;
$$;

COMMIT;
