-- Phase 4.2 — NECC zonal egg rates
--
-- Egg farmers price by NECC (National Egg Coordination Committee) ZONAL rates,
-- declared per declaration centre (Namakkal, Hyderabad, Barwala, Mumbai…), not
-- per state. The existing per-state market_prices.egg_price_per_100 is too coarse
-- for the Namakkal/AP layer belt. This adds a zone-keyed NECC rate table that a
-- daily fetch Edge Function (fetch-necc-egg-rates) populates, plus a per-farm
-- zone selection. Broiler live-bird price stays in market_prices (state-level is
-- an acceptable regional proxy and already feeds the sell-timing calculator).

CREATE TABLE IF NOT EXISTS public.necc_egg_rates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zone         TEXT NOT NULL,
  price_date   DATE NOT NULL,
  -- NECC declares a per-egg rate; we store the ₹/100-eggs figure used elsewhere.
  rate_per_100 NUMERIC NOT NULL CHECK (rate_per_100 >= 0),
  source       TEXT NOT NULL DEFAULT 'necc',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (zone, price_date)
);

CREATE INDEX IF NOT EXISTS idx_necc_egg_rates_zone_date
  ON public.necc_egg_rates (zone, price_date DESC);

COMMENT ON TABLE public.necc_egg_rates IS 'NECC zonal egg declaration rates (national reference data). Populated by fetch-necc-egg-rates; readable by any authenticated user.';

-- Per-farm NECC zone (which declaration centre this farm prices against).
ALTER TABLE public.farms ADD COLUMN IF NOT EXISTS necc_zone TEXT;
COMMENT ON COLUMN public.farms.necc_zone IS 'NECC declaration zone the farm tracks egg rates against (e.g. Namakkal, Hyderabad).';

-- RLS: reference data — any authenticated user reads; only service_role writes
-- (the fetch Edge Function). No tenant scoping (rates are national).
ALTER TABLE public.necc_egg_rates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS necc_egg_rates_select_authenticated ON public.necc_egg_rates;
CREATE POLICY necc_egg_rates_select_authenticated
  ON public.necc_egg_rates FOR SELECT
  TO authenticated
  USING (true);

-- (No INSERT/UPDATE/DELETE policies → only service_role, which bypasses RLS,
-- can write. Mirrors the integrators master-data pattern.)
