-- =============================================================================
-- PoultryOS — Manual market-price entry RPC
-- File: 20260520000002_upsert_market_price_rpc.sql
-- Created: 2026-05-20
-- Purpose: upsert_market_price(state, date, broiler, eggs) — owner-only
--          SECURITY DEFINER RPC for manual market-price entry. Bypasses the
--          "service_role only writes" policy on market_prices while still
--          enforcing that the caller is an owner of at least one farm in
--          the same state (so we don't let anyone pollute global price data).
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_market_price(
  p_state                 TEXT,
  p_price_date            DATE,
  p_broiler_price_per_kg  NUMERIC,
  p_egg_price_per_100     NUMERIC
)
  RETURNS public.market_prices
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_is_owner_in_state BOOLEAN;
  v_row               public.market_prices%ROWTYPE;
BEGIN
  IF p_state IS NULL OR length(trim(p_state)) = 0 THEN
    RAISE EXCEPTION 'state is required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_price_date IS NULL OR p_price_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'price_date must be a real date on or before today'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_broiler_price_per_kg IS NULL AND p_egg_price_per_100 IS NULL THEN
    RAISE EXCEPTION 'at least one of broiler_price_per_kg or egg_price_per_100 must be set'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_broiler_price_per_kg IS NOT NULL AND p_broiler_price_per_kg < 0 THEN
    RAISE EXCEPTION 'broiler_price_per_kg must be non-negative'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_egg_price_per_100 IS NOT NULL AND p_egg_price_per_100 < 0 THEN
    RAISE EXCEPTION 'egg_price_per_100 must be non-negative'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Caller must be an owner of at least one farm in this state.
  SELECT EXISTS (
    SELECT 1
      FROM public.farm_users fu
      JOIN public.farms f ON f.id = fu.farm_id
     WHERE fu.user_id = auth.uid()
       AND fu.role = 'owner'
       AND f.state = p_state
  ) INTO v_is_owner_in_state;
  IF NOT v_is_owner_in_state THEN
    RAISE EXCEPTION 'only farm owners in % can set market prices for that state', p_state
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.market_prices (
    state, price_date, broiler_price_per_kg, egg_price_per_100, source
  ) VALUES (
    p_state, p_price_date, p_broiler_price_per_kg, p_egg_price_per_100, 'manual'
  )
  ON CONFLICT (state, price_date) DO UPDATE
    SET broiler_price_per_kg = COALESCE(EXCLUDED.broiler_price_per_kg, public.market_prices.broiler_price_per_kg),
        egg_price_per_100    = COALESCE(EXCLUDED.egg_price_per_100, public.market_prices.egg_price_per_100),
        source               = 'manual',
        updated_at           = now()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.upsert_market_price(TEXT, DATE, NUMERIC, NUMERIC) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_market_price(TEXT, DATE, NUMERIC, NUMERIC) FROM anon;
GRANT  EXECUTE ON FUNCTION public.upsert_market_price(TEXT, DATE, NUMERIC, NUMERIC) TO authenticated;

COMMENT ON FUNCTION public.upsert_market_price(TEXT, DATE, NUMERIC, NUMERIC) IS
  'Owner-of-state-only manual market-price entry. Inserts or updates market_prices(state,price_date) with source=manual.';

COMMIT;
