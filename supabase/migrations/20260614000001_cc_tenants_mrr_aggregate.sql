-- #1 Correct MRR aggregate for the Tenants list.
-- The page previously summed MRR over only the first 200 loaded rows, printing a
-- materially wrong headline number. This RPC computes MRR across ALL tenants
-- matching the (optional) name search, mirroring the per-row mrrInr logic:
-- active subscriptions only; yearly -> round(yearly/12); else monthly.
create or replace function public.cc_tenants_mrr(p_search text default null)
returns numeric
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce(sum(
    case when ts.status = 'active' then
      case when ts.billing_cycle = 'yearly'
        then round(coalesce(sp.yearly_price_inr, 0) / 12.0)
        else coalesce(sp.monthly_price_inr, 0)
      end
    else 0 end
  ), 0)::numeric
  from public.tenants t
  join public.tenant_subscriptions ts on ts.tenant_id = t.id
  join public.subscription_plans sp on sp.id = ts.plan_id
  where (p_search is null or p_search = '' or t.name ilike '%' || p_search || '%');
$$;

revoke all on function public.cc_tenants_mrr(text) from public;
revoke all on function public.cc_tenants_mrr(text) from anon;
grant execute on function public.cc_tenants_mrr(text) to authenticated, service_role;
