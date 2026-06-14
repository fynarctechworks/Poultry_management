// =============================================================================
// Control Center — access guard.
// =============================================================================
// The single chokepoint for every Control Center server action / server page.
//   getPlatformContext()            → resolves the current operator (or null)
//   requirePlatformPermission(perm) → asserts a specific permission, else throws
//
// Permission resolution is DB-driven: `platform_has_permission()` (SECURITY
// DEFINER) is called through the operator's own authed session so auth.uid()
// resolves to them. Data access then uses the service-role client.
// =============================================================================

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceClient } from './serviceClient';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface PlatformContext {
  userId: string;
  email: string | null;
  roleCode: string;
  roleName: string;
  /** Permission codes the operator holds. Contains '*' for super admins. */
  permissions: string[];
  service: SupabaseClient;
}

/** HTTP-ish error so callers can map to 403 without pulling in a framework. */
export class PlatformForbiddenError extends Error {
  status = 403 as const;
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'PlatformForbiddenError';
  }
}

/**
 * Resolve the current operator. Returns null when the visitor is not an active
 * platform admin (the layout uses this to gate the whole route group).
 */
export async function getPlatformContext(): Promise<PlatformContext | null> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: isAdmin } = await supabase.rpc('is_platform_admin');
  if (!isAdmin) return null;

  // Resolve role for display (service client; RLS already cleared by isAdmin).
  const service = createServiceClient();
  const { data: admin } = await service
    .from('platform_admins')
    .select('role_id, platform_roles(code, name)')
    .eq('user_id', user.id)
    .maybeSingle();

  const role = (admin?.platform_roles ?? null) as { code?: string; name?: string } | null;

  // Resolve the operator's permission codes so the UI (e.g. nav) can hide
  // surfaces they cannot use. Server pages still enforce via requirePlatformPermission.
  let permissions: string[] = [];
  if (admin?.role_id) {
    const { data: perms } = await service
      .from('platform_role_permissions')
      .select('platform_permissions(code)')
      .eq('role_id', admin.role_id);
    permissions = (perms ?? [])
      .map((r) => (r.platform_permissions as { code?: string } | null)?.code)
      .filter((c): c is string => !!c);
  }

  // Best-effort last-active stamp (non-blocking).
  void service
    .from('platform_admins')
    .update({ last_active_at: new Date().toISOString() })
    .eq('user_id', user.id);

  return {
    userId: user.id,
    email: user.email ?? null,
    roleCode: role?.code ?? 'unknown',
    roleName: role?.name ?? 'Operator',
    permissions,
    service,
  };
}

/**
 * Assert the operator holds `permission`. Returns the context (incl. the
 * service client) on success; throws PlatformForbiddenError otherwise.
 * Call this at the top of every guarded server action / page.
 */
export async function requirePlatformPermission(
  permission: string
): Promise<PlatformContext> {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new PlatformForbiddenError('Not signed in');

  const { data: allowed, error } = await supabase.rpc('platform_has_permission', {
    p_perm: permission,
  });
  if (error) throw new PlatformForbiddenError(error.message);
  if (!allowed) throw new PlatformForbiddenError(`Missing permission: ${permission}`);

  const ctx = await getPlatformContext();
  if (!ctx) throw new PlatformForbiddenError();
  return ctx;
}
