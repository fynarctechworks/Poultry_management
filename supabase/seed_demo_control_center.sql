-- =============================================================================
-- Demo seed for the SaaS Control Center (dashboard + all modules).
-- Idempotent: re-running cleans previous demo rows first. Demo data is namespaced
-- by tenant UUID prefix 'dddd0000-...' and auth events by metadata_json->>'demo'.
--
-- Apply via Supabase MCP (execute_sql) — NOT `supabase db push`. This is DATA, not
-- schema; it intentionally lives outside migrations/ so it is never auto-applied.
--
-- To REMOVE all demo data, run just the CLEANUP block below.
--
-- Assumes: an existing auth user to own the demo tenants (owner_id below) and the
-- seeded subscription_plans (growth / professional). Update the UUIDs if the
-- project's owner/plan ids differ.
-- =============================================================================

\set ON_ERROR_STOP on

-- NOTE: a trigger auto-creates one tenant_subscriptions row per tenant insert
-- (unique on tenant_id), so the subscriptions step UPSERTs over those rows.

-- ============ CLEANUP ============
delete from public.payment_attempts where tenant_id::text like 'dddd0000-%';
delete from public.payments         where tenant_id::text like 'dddd0000-%';
delete from public.platform_errors  where tenant_id::text like 'dddd0000-%';
delete from public.support_tickets  where tenant_id::text like 'dddd0000-%';
delete from public.customer_health  where tenant_id::text like 'dddd0000-%';
delete from public.tenant_subscriptions where tenant_id::text like 'dddd0000-%';
delete from public.tenants          where id::text like 'dddd0000-%';
delete from public.auth_audit_events where (metadata_json->>'demo')='true';
delete from public.revenue_snapshots where snapshot_date >= current_date - 34;

-- ============ TENANTS (28 across all lifecycle states) ============
with g as (select generate_series(1,28) n)
insert into public.tenants (id, name, owner_id, business_type, status, health_score, mrr_inr, created_at, updated_at)
select
  ('dddd0000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,
  'Demo Farm '||lpad(n::text,2,'0'),
  '3f5f829b-14bc-4b51-90ca-b42a1bd6b054'::uuid,
  (array['broiler','layer','breeder','hatchery','mixed'])[1+(n%5)],
  case when n between 1 and 18 then 'active' when n between 19 and 23 then 'trial'
       when n=24 then 'past_due' when n in (25,26) then 'suspended'
       when n=27 then 'cancelled' else 'active' end,
  case when n in (3,9,15,21,25,27) then 25+(n%10) when n in (6,12,18,24) then 58+(n%8) else 80+(n%15) end,
  case when n between 1 and 18 or n in (24,28)
       then case when n%2=1 then (case when n%3=0 then 417 else 499 end)
                 else (case when n%3=0 then 1250 else 1499 end) end else 0 end,
  now() - (n*8 || ' days')::interval, now()
from g;

-- ============ TENANT SUBSCRIPTIONS (upsert over trigger rows) ============
with g as (select generate_series(1,28) n)
insert into public.tenant_subscriptions
 (id, tenant_id, plan_id, status, billing_cycle, trial_started_at, trial_ends_at, trial_converted_at, current_period_end, cancelled_at, created_at, updated_at)
select
 ('dddd0000-0000-4000-8001-'||lpad(to_hex(n),12,'0'))::uuid,
 ('dddd0000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,
 case when n%2=1 then '879db5d7-43b8-45d3-95e5-610180a5042f'::uuid else '67a01435-aa8e-41d3-a386-92a37b70e595'::uuid end,
 case when n between 1 and 18 then 'active' when n between 19 and 23 then 'trial'
      when n=24 then 'past_due' when n in (25,26) then 'suspended' when n=27 then 'cancelled' else 'active' end,
 case when n%3=0 then 'yearly' else 'monthly' end,
 now() - (n*8 || ' days')::interval,
 case when n between 19 and 23 then (case when n in (19,20) then now()+interval '4 days' else now()+interval '12 days' end) else null end,
 case when n between 1 and 18 or n in (24,28) then now() - (n*8 || ' days')::interval + interval '10 days' else null end,
 case when n between 1 and 18 or n=28 then (case when n in (4,10,16) then now()+interval '3 days' else now()+((15+n)||' days')::interval end)
      when n=24 then now()-interval '3 days' else null end,
 case when n in (25,26) then now()-interval '10 days' when n=27 then now()-interval '20 days' else null end,
 now() - (n*8 || ' days')::interval, now()
from g
on conflict (tenant_id) do update set
 plan_id=excluded.plan_id, status=excluded.status, billing_cycle=excluded.billing_cycle,
 trial_started_at=excluded.trial_started_at, trial_ends_at=excluded.trial_ends_at,
 trial_converted_at=excluded.trial_converted_at, current_period_end=excluded.current_period_end,
 cancelled_at=excluded.cancelled_at, updated_at=now();

-- ============ CUSTOMER HEALTH (upsert) ============
with g as (select generate_series(1,28) n)
insert into public.customer_health
 (tenant_id, score, risk_band, payment_score, usage_score, login_score, setup_score, churn_risk, computed_at)
select
 ('dddd0000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,
 case when n in (3,9,15,21,25,27) then 25+(n%10) when n in (6,12,18,24) then 58+(n%8) else 80+(n%15) end,
 case when n in (3,9,15,21,25,27) then 'red' when n in (6,12,18,24) then 'yellow' else 'green' end,
 case when n in (3,9,15,21,25,27) then 10+(n%10) else 70+(n%25) end,
 case when n in (3,9,15,21,25,27) then 15+(n%10) else 60+(n%30) end,
 case when n in (3,9,15,21,25,27) then 20+(n%10) else 65+(n%25) end,
 case when n in (3,9,15,21,25,27) then 30+(n%10) else 75+(n%20) end,
 (n in (3,9,15,21,25,27)), now()
from g
on conflict (tenant_id) do update set
 score=excluded.score, risk_band=excluded.risk_band, payment_score=excluded.payment_score,
 usage_score=excluded.usage_score, login_score=excluded.login_score, setup_score=excluded.setup_score,
 churn_risk=excluded.churn_risk, computed_at=now();

-- ============ REVENUE SNAPSHOTS (35 days, rising MRR) ============
insert into public.revenue_snapshots
 (snapshot_date, mrr_inr, arr_inr, arpu_inr, active_count, trial_count, past_due_count, cancelled_count, created_at)
select (current_date - gg)::date, (12000 + (34-gg)*470)::numeric, ((12000 + (34-gg)*470)*12)::numeric,
 round((12000 + (34-gg)*470)::numeric / nullif(8 + (34-gg)/3,0), 2),
 (8 + (34-gg)/3)::int, (3 + ((34-gg)%5))::int, (1 + (gg%2))::int, (gg%3)::int, now()
from generate_series(0,34) gg
on conflict (snapshot_date) do update set
 mrr_inr=excluded.mrr_inr, arr_inr=excluded.arr_inr, arpu_inr=excluded.arpu_inr,
 active_count=excluded.active_count, trial_count=excluded.trial_count,
 past_due_count=excluded.past_due_count, cancelled_count=excluded.cancelled_count;

-- ============ SUPPORT TICKETS (14) ============
insert into public.support_tickets (tenant_id, subject, description, status, priority, category, assigned_to, created_at, resolved_at, updated_at)
values
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(2),12,'0'))::uuid, 'Cannot sync daily logs offline', 'Logs stuck in queue on Redmi 9A', 'open','urgent','bug', null, now()-interval '2 hours', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(4),12,'0'))::uuid, 'WhatsApp digest not arriving', 'No 8 PM digest for 3 days', 'open','high','whatsapp', null, now()-interval '5 hours', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(6),12,'0'))::uuid, 'UPI QR shows wrong VPA', 'QR encodes old upi id', 'escalated','urgent','payments', null, now()-interval '1 day', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(8),12,'0'))::uuid, 'Heat-stress alert false positive', 'Alert at 28C threshold', 'open','high','weather', null, now()-interval '3 days', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(10),12,'0'))::uuid, 'How to add a worker?', 'Owner wants to invite staff', 'open','normal','question', null, now()-interval '2 hours', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(12),12,'0'))::uuid, 'Export PDF missing batches', 'P&L export blank', 'pending','normal','bug', null, now()-interval '4 days', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(14),12,'0'))::uuid, 'Feature request: Hindi UI', 'Vernacular support', 'open','low','feature', null, now()-interval '6 days', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(1),12,'0'))::uuid, 'Mortality trigger delayed', 'Push took 5 min', 'open','normal','bug', null, now()-interval '1 day', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(3),12,'0'))::uuid, 'Billing invoice not generated', 'No invoice after payment', 'resolved','normal','billing', null, now()-interval '8 days', now()-interval '2 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(5),12,'0'))::uuid, 'Login OTP not received', 'MSG91 delay', 'resolved','high','auth', null, now()-interval '10 days', now()-interval '1 day', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(7),12,'0'))::uuid, 'Old closed ticket', 'Resolved long ago', 'closed','normal','question', null, now()-interval '20 days', now()-interval '15 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(9),12,'0'))::uuid, 'Contract settlement mismatch', 'FCR bonus wrong', 'resolved','normal','contract', null, now()-interval '9 days', now()-interval '3 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(11),12,'0'))::uuid, 'App crash on dashboard', 'Crashes on 2GB device', 'open','urgent','bug', null, now()-interval '12 hours', null, now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(13),12,'0'))::uuid, 'Vaccination reminder timezone', 'Reminder at wrong time', 'pending','high','bug', null, now()-interval '2 days', null, now());

-- ============ PLATFORM ERRORS (9) ============
insert into public.platform_errors (tenant_id, source, module, route, message, severity, status, fingerprint, occurrence_count, first_seen_at, last_seen_at, created_at, updated_at)
values
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(3),12,'0'))::uuid, 'api','billing','/api/razorpay/webhook','Unhandled exception: null subscription_id in webhook payload','critical','open','err-billing-null-sub',14, now()-interval '5 days', now()-interval '1 hour', now()-interval '5 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(9),12,'0'))::uuid, 'rpc','contracts','rpc:calculate_contract_settlement','division by zero in FCR bonus calc','critical','investigating','err-contract-divzero',6, now()-interval '3 days', now()-interval '3 hours', now()-interval '3 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(5),12,'0'))::uuid, 'frontend','daily-log','/log','TypeError: cannot read property weight of undefined','error','open','err-dailylog-weight',31, now()-interval '7 days', now()-interval '2 hours', now()-interval '7 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(11),12,'0'))::uuid, 'edge','weather','fn:fetch-weather-data','OpenWeatherMap 429 rate limit exceeded','error','open','err-weather-429',9, now()-interval '4 days', now()-interval '30 hours', now()-interval '4 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(2),12,'0'))::uuid, 'payment','billing','fn:create-upi-collect-link','Razorpay API timeout after 10s','warning','open','err-upi-timeout',4, now()-interval '6 days', now()-interval '1 day', now()-interval '6 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(7),12,'0'))::uuid, 'edge','whatsapp','fn:send-whatsapp-message','AiSensy template not approved: heat_stress_alert','error','investigating','err-aisensy-template',12, now()-interval '2 days', now()-interval '5 hours', now()-interval '2 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(13),12,'0'))::uuid, 'frontend','dashboard','/dashboard','ChunkLoadError: failed to load chart bundle','warning','open','err-chunk-chart',7, now()-interval '5 days', now()-interval '2 days', now()-interval '5 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(1),12,'0'))::uuid, 'job','notifications','job:send-vaccination-reminders','3 push tokens invalid, skipped','info','resolved','err-push-invalid',3, now()-interval '10 days', now()-interval '3 days', now()-interval '10 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(4),12,'0'))::uuid, 'api','inventory','/api/inventory/movement','Deadlock detected on inventory_items update','error','ignored','err-inventory-deadlock',2, now()-interval '8 days', now()-interval '1 day', now()-interval '8 days', now());

-- ============ PAYMENTS (16; n=7 failed => ~94% success) ============
insert into public.payments (tenant_id, razorpay_payment_id, razorpay_order_id, amount_inr, currency, method, status, captured_at, fee_inr, tax_inr, created_at, updated_at)
select
 ('dddd0000-0000-4000-8000-'||lpad(to_hex(n),12,'0'))::uuid,
 'pay_DEMO'||lpad(n::text,4,'0'), 'order_DEMO'||lpad(n::text,4,'0'),
 case when n%2=1 then 499 else 1499 end, 'INR',
 (array['upi','card','netbanking'])[1+(n%3)],
 case when n=7 then 'failed' else 'captured' end,
 case when n=7 then null else now() - ((n*1.8)||' days')::interval end,
 case when n=7 then 0 else round((case when n%2=1 then 499 else 1499 end)*0.02,2) end,
 case when n=7 then 0 else round((case when n%2=1 then 499 else 1499 end)*0.02*0.18,2) end,
 now() - ((n*1.8)||' days')::interval, now()
from generate_series(1,16) n;

-- ============ PAYMENT ATTEMPTS (2 failed in last 7d) ============
insert into public.payment_attempts (tenant_id, plan_id, billing_cycle, razorpay_subscription_id, razorpay_order_id, amount_inr, status, attempt_no, failure_reason, created_at, updated_at)
values
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(2),12,'0'))::uuid, '67a01435-aa8e-41d3-a386-92a37b70e595'::uuid, 'monthly','sub_DEMO02','order_ATT02',1499,'success',1,null, now()-interval '20 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(4),12,'0'))::uuid, '67a01435-aa8e-41d3-a386-92a37b70e595'::uuid, 'monthly','sub_DEMO04','order_ATT04',1499,'failed',2,'Insufficient funds on UPI account', now()-interval '3 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(6),12,'0'))::uuid, '67a01435-aa8e-41d3-a386-92a37b70e595'::uuid, 'monthly','sub_DEMO06','order_ATT06',1499,'failed',1,'Card declined by issuing bank', now()-interval '1 day', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(8),12,'0'))::uuid, '67a01435-aa8e-41d3-a386-92a37b70e595'::uuid, 'monthly','sub_DEMO08','order_ATT08',1499,'initiated',1,null, now()-interval '10 days', now()),
 (('dddd0000-0000-4000-8000-'||lpad(to_hex(10),12,'0'))::uuid, '67a01435-aa8e-41d3-a386-92a37b70e595'::uuid, 'monthly','sub_DEMO10','order_ATT10',1499,'success',1,null, now()-interval '2 days', now());

-- ============ AUTH AUDIT EVENTS (8 failed logins in 24h + 3 success) ============
insert into public.auth_audit_events (event_type, ip_address, user_agent, metadata_json, created_at)
select 'login_failed', '49.207.'||(n%255)||'.'||((n*7)%255), 'Mozilla/5.0 (Linux; Android 11; Redmi 9A)',
 jsonb_build_object('demo',true,'reason','invalid_password','attempt',n), now() - ((n*2)||' hours')::interval
from generate_series(1,8) n
union all
select 'login_success', '49.207.10.'||n, 'Mozilla/5.0 (Linux; Android 12)', jsonb_build_object('demo',true), now()-((n*3)||' hours')::interval
from generate_series(1,3) n;
