-- #10 MFA enforcement helper. Returns true when the current operator has at least
-- one VERIFIED TOTP factor. Reads auth.mfa_factors via SECURITY DEFINER so the
-- Control Center layout can hard-gate operators who haven't enrolled 2FA.
create or replace function public.platform_operator_has_mfa()
returns boolean
language sql
stable
security definer
set search_path to 'auth', 'public', 'pg_temp'
as $$
  select exists (
    select 1 from auth.mfa_factors
    where user_id = auth.uid() and status = 'verified'
  );
$$;

revoke all on function public.platform_operator_has_mfa() from public;
revoke all on function public.platform_operator_has_mfa() from anon;
grant execute on function public.platform_operator_has_mfa() to authenticated;
