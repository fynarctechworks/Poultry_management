-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 6 / M12: System Monitoring
-- File: 20260611000018_system_monitoring.sql
-- =============================================================================
-- Live system-health readers for the operator System page. No new tables —
-- metrics are read on demand from pg_stat_* + the platform tables. SECURITY
-- DEFINER so the service-role page can read server internals; granted to
-- service_role only.
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.system_health()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_db_size      BIGINT;
  v_conns        INT;
  v_max_conns    INT;
  v_cache_ratio  NUMERIC;
  v_open_errors  INT;
  v_crit_errors  INT;
  v_audit_24h    INT;
  v_tenants      INT;
  v_suspended    INT;
  v_cron_jobs    INT;
  v_cron_fail    INT;
BEGIN
  SELECT pg_database_size(current_database()) INTO v_db_size;
  SELECT count(*) INTO v_conns FROM pg_stat_activity;
  SELECT setting::INT INTO v_max_conns FROM pg_settings WHERE name = 'max_connections';

  SELECT round(100.0 * sum(blks_hit) / NULLIF(sum(blks_hit) + sum(blks_read), 0), 2)
    INTO v_cache_ratio FROM pg_stat_database;

  SELECT count(*) FILTER (WHERE status = 'open'),
         count(*) FILTER (WHERE status = 'open' AND severity = 'critical')
    INTO v_open_errors, v_crit_errors FROM public.platform_errors;

  SELECT count(*) INTO v_audit_24h FROM public.platform_audit_events
    WHERE created_at > now() - interval '24 hours';

  SELECT count(*) FILTER (WHERE deleted_at IS NULL),
         count(*) FILTER (WHERE status = 'suspended')
    INTO v_tenants, v_suspended FROM public.tenants;

  -- pg_cron lives in the cron schema; guard in case it's absent.
  BEGIN
    SELECT count(*) INTO v_cron_jobs FROM cron.job;
    SELECT count(*) INTO v_cron_fail FROM cron.job_run_details
      WHERE status <> 'succeeded' AND start_time > now() - interval '24 hours';
  EXCEPTION WHEN OTHERS THEN
    v_cron_jobs := NULL; v_cron_fail := NULL;
  END;

  RETURN jsonb_build_object(
    'db_size_bytes',     v_db_size,
    'active_connections', v_conns,
    'max_connections',   v_max_conns,
    'cache_hit_ratio',   v_cache_ratio,
    'open_errors',       v_open_errors,
    'critical_errors',   v_crit_errors,
    'audit_events_24h',  v_audit_24h,
    'tenants',           v_tenants,
    'suspended_tenants', v_suspended,
    'cron_jobs',         v_cron_jobs,
    'cron_failures_24h', v_cron_fail,
    'measured_at',       now()
  );
END;
$$;

-- Recent cron run details (for the System page table).
CREATE OR REPLACE FUNCTION public.system_cron_runs()
RETURNS TABLE (jobname TEXT, status TEXT, start_time TIMESTAMPTZ, run_duration INTERVAL)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN QUERY
  SELECT j.jobname, d.status, d.start_time, (d.end_time - d.start_time)
    FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
   ORDER BY d.start_time DESC LIMIT 20;
EXCEPTION WHEN OTHERS THEN
  RETURN;  -- pg_cron not available
END;
$$;

REVOKE EXECUTE ON FUNCTION public.system_health()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.system_cron_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.system_health()    TO service_role;
GRANT EXECUTE ON FUNCTION public.system_cron_runs() TO service_role;

COMMIT;
