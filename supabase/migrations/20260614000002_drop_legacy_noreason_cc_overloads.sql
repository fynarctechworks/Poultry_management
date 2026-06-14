-- #5 Remove RPC overload drift. The Control Center UI now calls the reason-bearing
-- variants (cc_extend_trial/3, cc_reset_subscription/2, cc_change_tenant_plan/4),
-- which record an operator reason into subscription_history + the audit log.
-- Drop the legacy no-reason overloads so billing-affecting actions can never be
-- invoked without an audit reason. (Verified: only saas-control-center referenced
-- these, and it has been repointed.)
drop function if exists public.cc_extend_trial(uuid, integer);
drop function if exists public.cc_reset_subscription(uuid);
drop function if exists public.cc_change_plan(uuid, text, text);
