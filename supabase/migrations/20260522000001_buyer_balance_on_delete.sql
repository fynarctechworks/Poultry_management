-- Recalculate buyers.current_balance when a financial_transaction is DELETED.
-- The original trigger fired only on INSERT/UPDATE, so deleting a buyer-linked
-- income transaction would leave the Khata balance stale.
--
-- update_buyer_balance() already coalesces OLD.buyer_id and recomputes the
-- balance from scratch (SUM over all of the buyer's transactions), so it is
-- correct for DELETE as-is. The WHEN clause is dropped because NEW is NULL on
-- DELETE; the function's own `IF v_buyer_id IS NULL THEN RETURN` guard skips
-- transactions with no buyer.

DROP TRIGGER IF EXISTS tg_financial_tx_update_buyer_balance ON public.financial_transactions;

CREATE TRIGGER tg_financial_tx_update_buyer_balance
  AFTER INSERT OR UPDATE OR DELETE ON public.financial_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_buyer_balance();
