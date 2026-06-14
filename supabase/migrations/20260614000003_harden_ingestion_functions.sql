-- #4 Ingestion hardening.
-- (a) report_error is the only anon-reachable ingestion function with no auth
--     check. Add payload caps + a severity whitelist so an unauthenticated caller
--     cannot inject oversized rows. Duplicate reports still collapse onto one row
--     via the fingerprint upsert. Kept anon-callable by design (pre-auth frontend
--     crash capture), but now bounded.
create or replace function public.report_error(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_fp TEXT; v_id UUID;
  v_source   TEXT := lower(coalesce(nullif(p_payload->>'source',''), 'frontend'));
  v_module   TEXT := left(p_payload->>'module', 120);
  v_route    TEXT := left(p_payload->>'route', 200);
  v_message  TEXT := left(coalesce(nullif(p_payload->>'message',''), '(no message)'), 2000);
  v_stack    TEXT := left(p_payload->>'stack', 8000);
  v_browser  TEXT := left(p_payload->>'browser', 200);
  v_device   TEXT := left(p_payload->>'device', 120);
  v_severity TEXT := lower(coalesce(p_payload->>'severity', 'error'));
BEGIN
  IF v_source NOT IN ('frontend','api','rpc','edge','webhook','payment','job') THEN v_source := 'frontend'; END IF;
  IF v_severity NOT IN ('info','warning','error','critical') THEN v_severity := 'error'; END IF;
  v_fp := coalesce(nullif(p_payload->>'fingerprint',''), md5(v_source || '|' || coalesce(v_module,'') || '|' || v_message));
  UPDATE public.platform_errors SET occurrence_count = occurrence_count + 1, last_seen_at = now()
   WHERE fingerprint = v_fp AND status IN ('open','investigating') RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    INSERT INTO public.platform_errors (tenant_id, user_id, source, module, route, message, stack, browser, device, severity, fingerprint)
    VALUES (nullif(p_payload->>'tenant_id','')::UUID, coalesce(nullif(p_payload->>'user_id','')::UUID, auth.uid()),
      v_source, v_module, v_route, v_message, v_stack, v_browser, v_device, v_severity, v_fp) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END;
$function$;

-- (b) log_auth_event and track_event already RAISE on anon (auth.uid() IS NULL),
--     so the anon EXECUTE grant is dead surface that only trips the linter.
--     Remove it; authenticated + service_role keep access.
revoke execute on function public.log_auth_event(text, text, text, text, jsonb) from anon;
revoke execute on function public.track_event(text, jsonb) from anon;
