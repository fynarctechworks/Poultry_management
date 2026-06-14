-- supabase/migrations/20260614000011_add_billing_permissions.sql
-- Bugfix: the Billing module (nav + page + RefundButton) gates on billing:read /
-- billing:manage, but those permissions were never seeded — making the whole module
-- invisible/inaccessible to every operator except wildcard (*) Founder/Super Admin.
-- Add them (platform_permissions requires resource + action columns) and map to the
-- same roles that hold the analogous revenue/subscription permissions.
-- Applied to remote via Supabase MCP.

insert into public.platform_permissions (code, resource, action, description) values
  ('billing:read',   'billing', 'read',   'View billing profiles, invoices and payments.'),
  ('billing:manage', 'billing', 'manage', 'Issue refunds and manage billing.')
on conflict (code) do nothing;

-- billing:read -> mirror revenue:read's role set (financial readers)
insert into public.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from public.platform_roles r
join public.platform_permissions p on p.code = 'billing:read'
where r.name in ('Customer Success','Finance Admin','QA','Read Only','Sales Manager')
on conflict do nothing;

-- billing:manage -> mirror subscription:manage's role set (Finance Admin only)
insert into public.platform_role_permissions (role_id, permission_id)
select r.id, p.id
from public.platform_roles r
join public.platform_permissions p on p.code = 'billing:manage'
where r.name in ('Finance Admin')
on conflict do nothing;
