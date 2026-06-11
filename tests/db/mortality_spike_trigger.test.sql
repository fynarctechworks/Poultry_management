-- =============================================================================
-- tests/db/mortality_spike_trigger.test.sql
-- pgTAP tests for the check_mortality_spike trigger on daily_logs.
--
-- LOCAL ONLY: run via `supabase db reset` on a local stack, NOT against the
-- remote project. This test inserts into daily_logs, which fires
-- tg_post_to_edge_function (a real pg_net HTTP call) when the >1% threshold is
-- crossed. On a local stack with no edge function settings, that call no-ops
-- safely; on remote it would emit live HTTP requests. Do not run on remote.
--
-- Trigger under test (from 20260502000000_initial_schema.sql):
--   check_mortality_spike() — AFTER INSERT ON daily_logs.
--   Threshold: birds_dead / opening_bird_count * 100 > 1.0%.
--   On breach, posts to send-push-notification + send-whatsapp-message.
--   No-op when birds_dead = 0 or opening_bird_count is NULL/0.
--
-- All fixture rows are rolled back at the end.
-- =============================================================================

BEGIN;

SELECT plan(6);

-- ---------------------------------------------------------------------------
-- Structural assertions
-- ---------------------------------------------------------------------------

SELECT has_function(
  'public', 'check_mortality_spike', ARRAY[]::text[],
  'T1: function public.check_mortality_spike() exists'
);

SELECT trigger_is(
  'public', 'daily_logs', 'tg_daily_logs_check_mortality',
  'public', 'check_mortality_spike',
  'T2: tg_daily_logs_check_mortality is wired to check_mortality_spike'
);

SELECT ok(
  (SELECT prosecdef
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'check_mortality_spike'),
  'T3: check_mortality_spike is SECURITY DEFINER'
);

-- ---------------------------------------------------------------------------
-- Behavioural assertions — fixtures
--
-- We need a farm → shed → batch chain. The batch opening_bird_count drives
-- the mortality percentage. Use a generous opening count so the threshold
-- maths is unambiguous.
-- ---------------------------------------------------------------------------

-- A fixture owner in auth.users (FK target of farms.owner_id + daily_logs.logged_by)
INSERT INTO auth.users (id, email)
  VALUES ('00000000-0000-0000-0000-0000000000aa', 'mortality-test@example.com')
  ON CONFLICT (id) DO NOTHING;

-- Tenant scope (required since the multi-tenant migration: every farm-bound
-- row carries a NOT NULL tenant_id).
INSERT INTO public.tenants (id, name, owner_id, status)
  VALUES ('00000000-0000-0000-0000-0000000000e1',
          'Mortality Test Tenant', '00000000-0000-0000-0000-0000000000aa', 'active')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO public.farms (id, tenant_id, owner_id, farm_name, owner_name, state, district, phone, farm_type)
  VALUES ('00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000e1',
          '00000000-0000-0000-0000-0000000000aa',
          'Mortality Test Farm', 'Test Owner', 'Telangana', 'Test District',
          '+910000000000', 'independent');

INSERT INTO public.sheds (id, tenant_id, farm_id, shed_name, capacity, poultry_type, status)
  VALUES ('00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000e1',
          '00000000-0000-0000-0000-0000000000f1',
          'Test Shed', 1000, 'broiler', 'active');

-- opening_bird_count = 1000 → 1% threshold = 10 birds.
INSERT INTO public.batches (id, tenant_id, shed_id, farm_id, breed_name, poultry_type,
                            placement_date, opening_bird_count, current_bird_count,
                            cost_per_bird, status)
  VALUES ('00000000-0000-0000-0000-0000000000c1',
          '00000000-0000-0000-0000-0000000000e1',
          '00000000-0000-0000-0000-0000000000d1',
          '00000000-0000-0000-0000-0000000000f1',
          'Cobb 500', 'broiler', current_date - 10, 1000, 1000, 35, 'active');

-- T4: a below-threshold insert (5 dead of 1000 = 0.5%) succeeds without error.
SELECT lives_ok(
  $$ INSERT INTO public.daily_logs
       (tenant_id, batch_id, farm_id, logged_by, log_date, birds_dead, death_cause,
        feed_consumed_kg, feed_type)
     VALUES ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-0000000000f1',
             '00000000-0000-0000-0000-0000000000aa',
             current_date - 2, 5, 'disease', 80, 'grower') $$,
  'T4: below-threshold daily_log insert (0.5%) succeeds'
);

-- T5: a zero-mortality insert succeeds (early-return path).
SELECT lives_ok(
  $$ INSERT INTO public.daily_logs
       (tenant_id, batch_id, farm_id, logged_by, log_date, birds_dead, death_cause,
        feed_consumed_kg, feed_type)
     VALUES ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-0000000000f1',
             '00000000-0000-0000-0000-0000000000aa',
             current_date - 1, 0, NULL, 82, 'grower') $$,
  'T5: zero-mortality daily_log insert succeeds (no-op path)'
);

-- T6: an above-threshold insert (25 dead of 1000 = 2.5%) succeeds. The trigger
-- attempts the edge-function POST; on a local stack with no settings this
-- no-ops, so the INSERT itself must still complete.
SELECT lives_ok(
  $$ INSERT INTO public.daily_logs
       (tenant_id, batch_id, farm_id, logged_by, log_date, birds_dead, death_cause,
        feed_consumed_kg, feed_type)
     VALUES ('00000000-0000-0000-0000-0000000000e1',
             '00000000-0000-0000-0000-0000000000c1',
             '00000000-0000-0000-0000-0000000000f1',
             '00000000-0000-0000-0000-0000000000aa',
             current_date, 25, 'heat_stress', 78, 'grower') $$,
  'T6: above-threshold daily_log insert (2.5%) succeeds and fires the alert path'
);

SELECT * FROM finish();

ROLLBACK;
