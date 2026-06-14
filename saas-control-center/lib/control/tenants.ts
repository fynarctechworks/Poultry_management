'use server';

// =============================================================================
// Control Center — tenant lifecycle server actions.
// =============================================================================
// State mutations are driven through the SECURITY DEFINER cc_* RPCs, called with
// the OPERATOR'S session (so auth.uid() resolves and the RPC re-checks the
// platform permission + writes an audit row atomically). Impersonation needs the
// admin API, so it runs through the service-role guard + explicit audit().
// =============================================================================

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { requirePlatformPermission, PlatformForbiddenError } from './guard';
import { audit } from './audit';

export type ActionResult =
  | { ok: true; message?: string; link?: string }
  | { ok: false; error: string };

function mapError(code: string | undefined, message: string): string {
  if (code === '42501') return 'You do not have permission for this action.';
  if (code === 'P0002') return 'Record not found.';
  if (code === '22023') return message; // validation message is already friendly
  return message;
}

async function runRpc(
  fn: string,
  args: Record<string, unknown>,
  tenantId: string
): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/tenants');
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { ok: true };
}

export async function suspendTenant(tenantId: string, reason: string): Promise<ActionResult> {
  if (!reason?.trim()) return { ok: false, error: 'A reason is required to suspend a tenant.' };
  return runRpc('cc_suspend_tenant', { p_tenant: tenantId, p_reason: reason.trim() }, tenantId);
}

export async function activateTenant(tenantId: string): Promise<ActionResult> {
  return runRpc('cc_activate_tenant', { p_tenant: tenantId }, tenantId);
}

export async function softDeleteTenant(tenantId: string, reason: string): Promise<ActionResult> {
  if (!reason?.trim()) return { ok: false, error: 'A reason is required to delete a tenant.' };
  return runRpc('cc_soft_delete_tenant', { p_tenant: tenantId, p_reason: reason.trim() }, tenantId);
}

export async function restoreTenant(tenantId: string): Promise<ActionResult> {
  return runRpc('cc_restore_tenant', { p_tenant: tenantId }, tenantId);
}

export async function extendTrial(
  tenantId: string,
  days: number,
  reason?: string
): Promise<ActionResult> {
  if (!days || days <= 0) return { ok: false, error: 'Enter a positive number of days.' };
  return runRpc(
    'cc_extend_trial',
    { p_tenant: tenantId, p_days: days, p_reason: reason?.trim() || null },
    tenantId
  );
}

export async function changePlan(
  tenantId: string,
  planCode: string,
  cycle: 'monthly' | 'yearly',
  reason?: string
): Promise<ActionResult> {
  if (!planCode) return { ok: false, error: 'Select a plan.' };
  return runRpc(
    'cc_change_tenant_plan',
    { p_tenant: tenantId, p_plan_code: planCode, p_cycle: cycle, p_reason: reason?.trim() || null },
    tenantId
  );
}

// Destructive: wipes the subscription back to a fresh 7-day trial and clears the
// Razorpay link. A reason is required and recorded in the audit log.
export async function resetSubscription(tenantId: string, reason: string): Promise<ActionResult> {
  if (!reason?.trim()) return { ok: false, error: 'A reason is required to reset a subscription.' };
  return runRpc('cc_reset_subscription', { p_tenant: tenantId, p_reason: reason.trim() }, tenantId);
}

/**
 * Audited impersonation. Generates a one-time magic-link sign-in for the tenant
 * owner. The operator opens it in a separate (incognito) window. Every use is
 * recorded in the immutable audit log with a mandatory reason.
 */
export async function impersonateTenant(tenantId: string, reason: string): Promise<ActionResult> {
  if (!reason?.trim()) return { ok: false, error: 'A reason is required to impersonate.' };

  let ctx;
  try {
    ctx = await requirePlatformPermission('tenant:impersonate');
  } catch (e) {
    return { ok: false, error: e instanceof PlatformForbiddenError ? e.message : 'Forbidden' };
  }

  const { data: tenant } = await ctx.service
    .from('tenants')
    .select('owner_id, name')
    .eq('id', tenantId)
    .maybeSingle();
  if (!tenant) return { ok: false, error: 'Tenant not found.' };

  const { data: ownerRes } = await ctx.service.auth.admin.getUserById(tenant.owner_id as string);
  const email = ownerRes?.user?.email;
  if (!email) return { ok: false, error: 'Tenant owner has no email to impersonate.' };

  const { data: link, error } = await ctx.service.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error) return { ok: false, error: error.message };

  await audit(ctx, {
    action: 'tenant.impersonate',
    permission: 'tenant:impersonate',
    targetType: 'tenant',
    targetId: tenantId,
    targetTenantId: tenantId,
    reason: reason.trim(),
    after: { owner_email: email },
  });

  return { ok: true, link: link.properties?.action_link ?? undefined };
}
