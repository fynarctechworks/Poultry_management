-- #6 (billing) Summary tiles must aggregate across ALL ledger rows, not just the
-- paginated page. Mirrors the prior in-page math: net collected, outstanding
-- invoices, total refunded, failed payment count.
create or replace function public.cc_billing_summary()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select jsonb_build_object(
    'collected_net', coalesce((
      select sum(amount_inr - coalesce(refunded_amount_inr, 0))
      from public.payments where status = 'captured'), 0),
    'refunded', coalesce((
      select sum(coalesce(refunded_amount_inr, 0)) from public.payments), 0),
    'failed_count', coalesce((
      select count(*) from public.payments where status = 'failed'), 0),
    'outstanding', coalesce((
      select sum(total_inr) from public.invoices where status in ('issued', 'failed')), 0)
  );
$$;

revoke all on function public.cc_billing_summary() from public;
revoke all on function public.cc_billing_summary() from anon;
grant execute on function public.cc_billing_summary() to authenticated, service_role;
