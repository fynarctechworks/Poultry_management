'use server';

// Control Center — customer success server actions (success:manage).
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult } from './tenants';

function mapError(code: string | undefined, message: string): string {
  if (code === '42501') return 'You do not have permission for customer-success actions.';
  if (code === 'P0002') return 'Record not found.';
  return message;
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/success', 'layout');
  return { ok: true };
}

export async function createFollowup(
  tenantId: string, reason: string, dueAt: string
): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, error: 'A reason is required.' };
  return rpc('cc_create_followup', { p_tenant: tenantId, p_reason: reason, p_due_at: dueAt || null });
}

export async function completeFollowup(followupId: string): Promise<ActionResult> {
  return rpc('cc_complete_followup', { p_followup: followupId });
}

export async function logInteraction(
  tenantId: string, type: string, summary: string
): Promise<ActionResult> {
  if (!type.trim()) return { ok: false, error: 'Interaction type is required.' };
  return rpc('cc_log_interaction', { p_tenant: tenantId, p_type: type, p_summary: summary || null });
}
