-- supabase/migrations/20260614000012_cc_interactions_and_followup_gate_fix.sql
-- Customer Success deepening:
--  1. cc_assert_any_permission(text[]) helper — assert the caller holds ANY of a set.
--  2. Bugfix: cc_create_followup / cc_complete_followup gated only on support:manage,
--     but the Customer Success role holds success:manage (NOT support:manage), so CS
--     operators could not manage their own follow-ups. Widen to accept either.
--  3. cc_log_interaction(p_tenant,p_type,p_summary) — log a customer interaction.
-- Applied to remote via Supabase MCP.

CREATE OR REPLACE FUNCTION public.cc_assert_any_permission(p_perms text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE perm text;
BEGIN
  FOREACH perm IN ARRAY p_perms LOOP
    IF public.platform_has_permission(perm) THEN RETURN; END IF;
  END LOOP;
  RAISE EXCEPTION 'forbidden: missing any of platform permissions %', p_perms USING ERRCODE = '42501';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cc_create_followup(p_tenant uuid, p_reason text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
RETURNS customer_followups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.customer_followups;
BEGIN
  PERFORM public.cc_assert_any_permission(ARRAY['success:manage','support:manage']);
  INSERT INTO public.customer_followups (tenant_id, assigned_to, reason, due_at)
    VALUES (p_tenant, auth.uid(), p_reason, p_due_at) RETURNING * INTO v_row;
  INSERT INTO public.customer_interactions (tenant_id, interaction_type, ref_id, summary, actor_id)
    VALUES (p_tenant, 'followup', v_row.id, 'Follow-up: ' || COALESCE(p_reason,''), auth.uid());
  PERFORM public.log_platform_event('followup.create','success:manage','followup',v_row.id,p_tenant,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cc_complete_followup(p_followup uuid)
RETURNS customer_followups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.customer_followups;
BEGIN
  PERFORM public.cc_assert_any_permission(ARRAY['success:manage','support:manage']);
  UPDATE public.customer_followups SET status='done', completed_at=now() WHERE id = p_followup RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'follow-up % not found', p_followup USING ERRCODE = 'P0002'; END IF;
  PERFORM public.log_platform_event('followup.complete','success:manage','followup',p_followup,v_row.tenant_id,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cc_log_interaction(p_tenant uuid, p_type text, p_summary text)
RETURNS customer_interactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_row public.customer_interactions;
BEGIN
  PERFORM public.cc_assert_any_permission(ARRAY['success:manage','support:manage']);
  IF COALESCE(p_type,'') = '' THEN RAISE EXCEPTION 'interaction type is required' USING ERRCODE = '22000'; END IF;
  INSERT INTO public.customer_interactions (tenant_id, interaction_type, summary, actor_id)
    VALUES (p_tenant, p_type, NULLIF(p_summary,''), auth.uid()) RETURNING * INTO v_row;
  PERFORM public.log_platform_event('interaction.log','success:manage','interaction',v_row.id,p_tenant,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cc_assert_any_permission(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cc_log_interaction(uuid, text, text) TO authenticated;
