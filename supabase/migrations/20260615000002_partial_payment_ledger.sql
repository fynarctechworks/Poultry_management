-- =============================================================================
-- PoultryOS — Partial-payment ledger (correctness fix)
-- File: 20260615000002_partial_payment_ledger.sql
-- Created: 2026-06-15
-- =============================================================================
-- PROBLEM: update_buyer_balance() assumed every 'partial' payment was exactly
-- 50% paid (`amount * 0.5`). The Khata receivable balance — the whole point of
-- the buyer ledger — was therefore fiction for any real partial payment.
--
-- FIX: record the actual paid amount per transaction (`amount_paid`) and derive
-- outstanding = amount - amount_paid. Design choices that keep every existing
-- code path safe:
--   * `payment_status` stays the source of truth for "fully paid": a 'paid' row
--     contributes 0 outstanding REGARDLESS of amount_paid, so MarkPaidButton
--     (which only flips status) keeps working untouched.
--   * `amount_paid` is NULLABLE; when NULL the functions fall back to the LEGACY
--     semantics (partial = 50%, pending = 0), so any insert path not yet updated
--     produces the same numbers as before — no silent balance jumps.
--   * Backfill (chosen policy): existing partials → 50%, paid → full, pending →
--     0, making the stored data explicit so owners can review/correct it.
-- =============================================================================

BEGIN;

-- ---------- 1. amount_paid column + guard -----------------------------------
ALTER TABLE public.financial_transactions
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2);

ALTER TABLE public.financial_transactions
  DROP CONSTRAINT IF EXISTS financial_transactions_amount_paid_chk;
ALTER TABLE public.financial_transactions
  ADD CONSTRAINT financial_transactions_amount_paid_chk
  CHECK (amount_paid IS NULL OR (amount_paid >= 0 AND amount_paid <= amount));

COMMENT ON COLUMN public.financial_transactions.amount_paid IS
  'Actual amount received. NULL falls back to legacy semantics in balance funcs '
  '(partial=50%, pending=0). A ''paid'' status always means fully settled.';

-- ---------- 2. Backfill (policy: existing partials = 50%) --------------------
UPDATE public.financial_transactions
   SET amount_paid = CASE
         WHEN payment_status = 'paid'    THEN amount
         WHEN payment_status = 'partial' THEN ROUND(amount * 0.5, 2)
         ELSE 0
       END
 WHERE amount_paid IS NULL;

-- ---------- 3. update_buyer_balance — outstanding = amount - amount_paid -----
CREATE OR REPLACE FUNCTION public.update_buyer_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_buyer_id UUID;
  v_balance  NUMERIC;
  v_volume   NUMERIC;
  v_last     DATE;
BEGIN
  v_buyer_id := COALESCE(NEW.buyer_id, OLD.buyer_id);
  IF v_buyer_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    COALESCE(SUM(
      CASE WHEN transaction_type = 'income' THEN
        CASE
          WHEN payment_status = 'paid'    THEN 0
          WHEN payment_status = 'partial' THEN GREATEST(amount - COALESCE(amount_paid, ROUND(amount * 0.5, 2)), 0)
          ELSE                                 GREATEST(amount - COALESCE(amount_paid, 0), 0)  -- pending
        END
      ELSE 0 END
    ), 0),
    COALESCE(SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END), 0),
    MAX(transaction_date)
    INTO v_balance, v_volume, v_last
    FROM public.financial_transactions
   WHERE buyer_id = v_buyer_id;

  UPDATE public.buyers
     SET current_balance       = v_balance,
         total_business_volume = v_volume,
         last_transaction_date = v_last,
         updated_at            = now()
   WHERE id = v_buyer_id;

  RETURN NEW;
END;
$$;

-- ---------- 4. check_payment_overdue — remind on OUTSTANDING, not gross ------
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
      ft.id     AS transaction_id,
      ft.farm_id,
      ft.buyer_id,
      GREATEST(ft.amount - COALESCE(ft.amount_paid,
               CASE WHEN ft.payment_status = 'partial' THEN ROUND(ft.amount * 0.5, 2) ELSE 0 END), 0) AS outstanding,
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
  SELECT o.transaction_id, o.farm_id, o.buyer_id, o.outstanding AS amount,
         o.due_date, o.days_overdue, o.reminder_stage
  FROM overdue o
  WHERE o.reminder_stage IS NOT NULL
    AND o.outstanding > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_reminders pr
       WHERE pr.transaction_id = o.transaction_id
         AND pr.reminder_stage = o.reminder_stage
    );
END;
$$;

-- ---------- 5. Recompute all buyer balances under the new logic --------------
-- With the 50% backfill above, results equal today's displayed balances; this
-- just makes the stored values consistent with the new function.
UPDATE public.buyers b
   SET current_balance       = COALESCE(agg.bal, 0),
       total_business_volume = COALESCE(agg.vol, 0),
       last_transaction_date = agg.last_date,
       updated_at            = now()
FROM (
  SELECT
    buyer_id,
    SUM(CASE WHEN transaction_type = 'income' THEN
      CASE
        WHEN payment_status = 'paid'    THEN 0
        WHEN payment_status = 'partial' THEN GREATEST(amount - COALESCE(amount_paid, ROUND(amount * 0.5, 2)), 0)
        ELSE                                 GREATEST(amount - COALESCE(amount_paid, 0), 0)
      END
    ELSE 0 END) AS bal,
    SUM(CASE WHEN transaction_type = 'income' THEN amount ELSE 0 END) AS vol,
    MAX(transaction_date) AS last_date
  FROM public.financial_transactions
  WHERE buyer_id IS NOT NULL
  GROUP BY buyer_id
) agg
WHERE b.id = agg.buyer_id;

COMMIT;

-- =============================================================================
-- Reversal:
--   DROP the amount_paid column (cascades the CHECK), then restore the prior
--   function bodies from 20260502000000_initial_schema.sql /
--   20260504000000_fix_payment_overdue_filter.sql.
-- =============================================================================
