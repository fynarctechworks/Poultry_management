-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 5 / M8: Error Monitoring
-- File: 20260611000016_error_monitoring.sql
-- =============================================================================
-- Centralized error capture across frontend / api / rpc / edge / webhook /
-- payment / job sources. report_error() dedups by fingerprint: a repeat of an
-- open error bumps occurrence_count + last_seen rather than spamming new rows.
-- Operators triage with an open → investigating → resolved → ignored workflow,
-- assignment, and comments — all guarded (error:manage) + audited.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_errors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  user_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source           TEXT NOT NULL DEFAULT 'frontend'
                     CHECK (source IN ('frontend','api','rpc','edge','webhook','payment','job')),
  module           TEXT,
  route            TEXT,
  message          TEXT NOT NULL,
  stack            TEXT,
  browser          TEXT,
  device           TEXT,
  severity         TEXT NOT NULL DEFAULT 'error'
                     CHECK (severity IN ('info','warning','error','critical')),
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','investigating','resolved','ignored')),
  assigned_to      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fingerprint      TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One open/active row per fingerprint (dedup target). Resolved/ignored rows can
-- coexist historically, so the partial unique index only covers active states.
CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_errors_active_fingerprint
  ON public.platform_errors(fingerprint)
  WHERE status IN ('open','investigating');
CREATE INDEX IF NOT EXISTS idx_platform_errors_status   ON public.platform_errors(status, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_errors_severity ON public.platform_errors(severity);
CREATE INDEX IF NOT EXISTS idx_platform_errors_tenant   ON public.platform_errors(tenant_id);
CREATE TRIGGER tg_platform_errors_updated_at BEFORE UPDATE ON public.platform_errors
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.error_comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_id   UUID NOT NULL REFERENCES public.platform_errors(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  comment    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_error_comments_error ON public.error_comments(error_id);

ALTER TABLE public.platform_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_comments  ENABLE ROW LEVEL SECURITY;
CREATE POLICY platform_errors_read ON public.platform_errors FOR SELECT USING (public.platform_has_permission('error:read'));
CREATE POLICY error_comments_read  ON public.error_comments  FOR SELECT USING (public.platform_has_permission('error:read'));

-- -----------------------------------------------------------------------------
-- report_error — ingestion with fingerprint dedup. Callable by any authenticated
-- client (the app reports its own errors). SECURITY DEFINER so no insert policy
-- is exposed. The fingerprint is provided by the client (e.g. hash of
-- module+message); if absent we derive one.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.report_error(p_payload JSONB)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_fp   TEXT;
  v_id   UUID;
BEGIN
  v_fp := COALESCE(NULLIF(p_payload->>'fingerprint',''),
                   md5(COALESCE(p_payload->>'source','frontend') || '|' ||
                       COALESCE(p_payload->>'module','') || '|' ||
                       COALESCE(p_payload->>'message','')));

  -- Bump an existing active row for this fingerprint, else insert.
  UPDATE public.platform_errors
     SET occurrence_count = occurrence_count + 1, last_seen_at = now()
   WHERE fingerprint = v_fp AND status IN ('open','investigating')
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    INSERT INTO public.platform_errors
      (tenant_id, user_id, source, module, route, message, stack, browser, device, severity, fingerprint)
    VALUES (
      NULLIF(p_payload->>'tenant_id','')::UUID,
      COALESCE(NULLIF(p_payload->>'user_id','')::UUID, auth.uid()),
      COALESCE(p_payload->>'source','frontend'),
      p_payload->>'module', p_payload->>'route', COALESCE(p_payload->>'message','(no message)'),
      p_payload->>'stack', p_payload->>'browser', p_payload->>'device',
      COALESCE(p_payload->>'severity','error'), v_fp)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$$;

-- Operator workflow (error:manage), audited.
CREATE OR REPLACE FUNCTION public.cc_set_error_status(p_error UUID, p_status TEXT)
RETURNS public.platform_errors LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.platform_errors;
BEGIN
  PERFORM public.cc_assert_permission('error:manage');
  SELECT to_jsonb(e) INTO v_before FROM public.platform_errors e WHERE id = p_error;
  IF v_before IS NULL THEN RAISE EXCEPTION 'error % not found', p_error USING ERRCODE = 'P0002'; END IF;
  UPDATE public.platform_errors SET status = p_status WHERE id = p_error RETURNING * INTO v_row;
  PERFORM public.log_platform_event('error.status','error:manage','error',p_error,v_row.tenant_id,v_before,to_jsonb(v_row),p_status);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_assign_error(p_error UUID, p_assignee UUID)
RETURNS public.platform_errors LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.platform_errors;
BEGIN
  PERFORM public.cc_assert_permission('error:manage');
  SELECT to_jsonb(e) INTO v_before FROM public.platform_errors e WHERE id = p_error;
  IF v_before IS NULL THEN RAISE EXCEPTION 'error % not found', p_error USING ERRCODE = 'P0002'; END IF;
  UPDATE public.platform_errors SET assigned_to = p_assignee WHERE id = p_error RETURNING * INTO v_row;
  PERFORM public.log_platform_event('error.assign','error:manage','error',p_error,v_row.tenant_id,v_before,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_add_error_comment(p_error UUID, p_comment TEXT)
RETURNS public.error_comments LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.error_comments;
BEGIN
  PERFORM public.cc_assert_permission('error:manage');
  INSERT INTO public.error_comments (error_id, author_id, comment)
  VALUES (p_error, auth.uid(), p_comment) RETURNING * INTO v_row;
  PERFORM public.log_platform_event('error.comment','error:manage','error',p_error,NULL,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.report_error(JSONB) FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.report_error(JSONB) TO authenticated';
  FOREACH fn IN ARRAY ARRAY[
    'public.cc_set_error_status(UUID,TEXT)',
    'public.cc_assign_error(UUID,UUID)',
    'public.cc_add_error_comment(UUID,TEXT)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

COMMIT;
