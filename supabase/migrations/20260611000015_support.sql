-- =============================================================================
-- PoultryOS — SaaS Control Center · Increment 5 / M6: Support & Call Center
-- File: 20260611000015_support.sql
-- =============================================================================
-- Internal support + customer success desk: tickets, calls, notes, follow-ups,
-- and a unified per-tenant interaction timeline. Every create/transition writes
-- a customer_interactions row (the timeline) and an immutable platform audit row.
-- Operator reads gated to support:read; writes via guarded RPCs (support:manage).
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  subject          TEXT NOT NULL,
  description      TEXT,
  status           TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','pending','escalated','resolved','closed')),
  priority         TEXT NOT NULL DEFAULT 'normal'
                     CHECK (priority IN ('low','normal','high','urgent')),
  category         TEXT,
  assigned_to      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_tenant ON public.support_tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_assignee ON public.support_tickets(assigned_to);
CREATE TRIGGER tg_support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.support_calls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  direction    TEXT NOT NULL DEFAULT 'outbound' CHECK (direction IN ('inbound','outbound')),
  phone        TEXT,
  status       TEXT NOT NULL DEFAULT 'completed'
                 CHECK (status IN ('queued','in_progress','completed','missed')),
  outcome      TEXT,
  duration_seconds INTEGER,
  assigned_to  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at   TIMESTAMPTZ,
  ended_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_calls_tenant ON public.support_calls(tenant_id);

CREATE TABLE IF NOT EXISTS public.call_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    UUID NOT NULL REFERENCES public.support_calls(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customer_followups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason       TEXT,
  due_at       TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_followups_tenant ON public.customer_followups(tenant_id);
CREATE TRIGGER tg_customer_followups_updated_at BEFORE UPDATE ON public.customer_followups
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Unified timeline (one row per meaningful interaction).
CREATE TABLE IF NOT EXISTS public.customer_interactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  interaction_type TEXT NOT NULL,           -- ticket | ticket_status | call | followup | note
  ref_id           UUID,
  summary          TEXT,
  actor_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_interactions_tenant ON public.customer_interactions(tenant_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- RLS: operator reads (support:read; timeline also visible to success:read).
-- Writes via SECURITY DEFINER RPCs / service role.
-- -----------------------------------------------------------------------------
ALTER TABLE public.support_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_calls         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_followups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY support_tickets_read    ON public.support_tickets    FOR SELECT USING (public.platform_has_permission('support:read'));
CREATE POLICY support_calls_read      ON public.support_calls      FOR SELECT USING (public.platform_has_permission('support:read'));
CREATE POLICY call_notes_read         ON public.call_notes         FOR SELECT USING (public.platform_has_permission('support:read'));
CREATE POLICY customer_followups_read ON public.customer_followups FOR SELECT USING (public.platform_has_permission('support:read'));
CREATE POLICY customer_interactions_read ON public.customer_interactions
  FOR SELECT USING (public.platform_has_permission('support:read') OR public.platform_has_permission('success:read'));

-- -----------------------------------------------------------------------------
-- Guarded, audited RPCs (support:manage).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_create_ticket(
  p_tenant UUID, p_subject TEXT, p_description TEXT,
  p_priority TEXT DEFAULT 'normal', p_category TEXT DEFAULT NULL)
RETURNS public.support_tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.support_tickets;
BEGIN
  PERFORM public.cc_assert_permission('support:manage');
  INSERT INTO public.support_tickets (tenant_id, subject, description, priority, category, created_by)
  VALUES (p_tenant, p_subject, p_description, COALESCE(p_priority,'normal'), p_category, auth.uid())
  RETURNING * INTO v_row;
  INSERT INTO public.customer_interactions (tenant_id, interaction_type, ref_id, summary, actor_id)
    VALUES (p_tenant, 'ticket', v_row.id, 'Ticket opened: ' || p_subject, auth.uid());
  PERFORM public.log_platform_event('ticket.create','support:manage','ticket',v_row.id,p_tenant,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_set_ticket_status(p_ticket UUID, p_status TEXT)
RETURNS public.support_tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.support_tickets;
BEGIN
  PERFORM public.cc_assert_permission('support:manage');
  SELECT to_jsonb(t) INTO v_before FROM public.support_tickets t WHERE id = p_ticket;
  IF v_before IS NULL THEN RAISE EXCEPTION 'ticket % not found', p_ticket USING ERRCODE = 'P0002'; END IF;
  UPDATE public.support_tickets
     SET status = p_status, resolved_at = CASE WHEN p_status IN ('resolved','closed') THEN now() ELSE resolved_at END
   WHERE id = p_ticket RETURNING * INTO v_row;
  INSERT INTO public.customer_interactions (tenant_id, interaction_type, ref_id, summary, actor_id)
    VALUES (v_row.tenant_id, 'ticket_status', p_ticket, 'Ticket → ' || p_status, auth.uid());
  PERFORM public.log_platform_event('ticket.status','support:manage','ticket',p_ticket,v_row.tenant_id,v_before,to_jsonb(v_row),p_status);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_assign_ticket(p_ticket UUID, p_assignee UUID)
RETURNS public.support_tickets LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_before JSONB; v_row public.support_tickets;
BEGIN
  PERFORM public.cc_assert_permission('support:manage');
  SELECT to_jsonb(t) INTO v_before FROM public.support_tickets t WHERE id = p_ticket;
  IF v_before IS NULL THEN RAISE EXCEPTION 'ticket % not found', p_ticket USING ERRCODE = 'P0002'; END IF;
  UPDATE public.support_tickets SET assigned_to = p_assignee WHERE id = p_ticket RETURNING * INTO v_row;
  PERFORM public.log_platform_event('ticket.assign','support:manage','ticket',p_ticket,v_row.tenant_id,v_before,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_log_call(
  p_tenant UUID, p_direction TEXT, p_phone TEXT, p_outcome TEXT,
  p_status TEXT DEFAULT 'completed', p_duration INTEGER DEFAULT NULL, p_note TEXT DEFAULT NULL)
RETURNS public.support_calls LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.support_calls;
BEGIN
  PERFORM public.cc_assert_permission('support:manage');
  INSERT INTO public.support_calls (tenant_id, direction, phone, outcome, status, duration_seconds, assigned_to, started_at, ended_at)
  VALUES (p_tenant, COALESCE(p_direction,'outbound'), p_phone, p_outcome, COALESCE(p_status,'completed'),
          p_duration, auth.uid(), now(), now())
  RETURNING * INTO v_row;
  IF p_note IS NOT NULL THEN
    INSERT INTO public.call_notes (call_id, author_id, note) VALUES (v_row.id, auth.uid(), p_note);
  END IF;
  INSERT INTO public.customer_interactions (tenant_id, interaction_type, ref_id, summary, actor_id)
    VALUES (p_tenant, 'call', v_row.id, COALESCE(p_direction,'outbound') || ' call: ' || COALESCE(p_outcome,'(no outcome)'), auth.uid());
  PERFORM public.log_platform_event('call.log','support:manage','call',v_row.id,p_tenant,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_create_followup(p_tenant UUID, p_reason TEXT, p_due_at TIMESTAMPTZ DEFAULT NULL)
RETURNS public.customer_followups LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.customer_followups;
BEGIN
  PERFORM public.cc_assert_permission('support:manage');
  INSERT INTO public.customer_followups (tenant_id, assigned_to, reason, due_at)
  VALUES (p_tenant, auth.uid(), p_reason, p_due_at) RETURNING * INTO v_row;
  INSERT INTO public.customer_interactions (tenant_id, interaction_type, ref_id, summary, actor_id)
    VALUES (p_tenant, 'followup', v_row.id, 'Follow-up: ' || COALESCE(p_reason,''), auth.uid());
  PERFORM public.log_platform_event('followup.create','support:manage','followup',v_row.id,p_tenant,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cc_complete_followup(p_followup UUID)
RETURNS public.customer_followups LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.customer_followups;
BEGIN
  PERFORM public.cc_assert_permission('support:manage');
  UPDATE public.customer_followups SET status = 'done', completed_at = now()
   WHERE id = p_followup RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'follow-up % not found', p_followup USING ERRCODE = 'P0002'; END IF;
  PERFORM public.log_platform_event('followup.complete','support:manage','followup',p_followup,v_row.tenant_id,NULL,to_jsonb(v_row),NULL);
  RETURN v_row;
END;
$$;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.cc_create_ticket(UUID,TEXT,TEXT,TEXT,TEXT)',
    'public.cc_set_ticket_status(UUID,TEXT)',
    'public.cc_assign_ticket(UUID,UUID)',
    'public.cc_log_call(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT)',
    'public.cc_create_followup(UUID,TEXT,TIMESTAMPTZ)',
    'public.cc_complete_followup(UUID)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

COMMIT;
