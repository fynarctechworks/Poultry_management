// =============================================================================
// Control Center — audit writer.
// =============================================================================
// EVERY mutating operator action must call this. It inserts an immutable row
// into platform_audit_events via the service client (the table rejects
// UPDATE/DELETE at the DB level). IP + User-Agent are pulled from request
// headers. The actor is recorded from the resolved PlatformContext.
// =============================================================================

import { headers } from 'next/headers';
import type { PlatformContext } from './guard';

export interface AuditInput {
  action: string;                 // e.g. 'tenant.suspend', 'plan.create'
  permission?: string;            // permission that authorised it
  targetType?: string;            // 'tenant' | 'plan' | 'admin' | ...
  targetId?: string | null;
  targetTenantId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;         // required for destructive actions
  status?: 'success' | 'failure';
  error?: string | null;
}

export async function audit(ctx: PlatformContext, input: AuditInput): Promise<void> {
  const h = headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;
  const userAgent = h.get('user-agent') ?? null;

  const { error } = await ctx.service.from('platform_audit_events').insert({
    actor_id: ctx.userId,
    actor_email: ctx.email,
    permission: input.permission ?? null,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    target_tenant_id: input.targetTenantId ?? null,
    before_json: input.before ?? null,
    after_json: input.after ?? null,
    reason: input.reason ?? null,
    ip,
    user_agent: userAgent,
    status: input.status ?? 'success',
    error: input.error ?? null,
  });

  // Audit must never silently vanish. Surface write failures loudly.
  if (error) {
    throw new Error(`Audit write failed for action "${input.action}": ${error.message}`);
  }
}
