'use server';

// Control Center — support / call-center server actions (support:manage).
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult } from './tenants';

function mapError(code: string | undefined, message: string): string {
  if (code === '42501') return 'You do not have permission for support actions.';
  if (code === 'P0002') return 'Record not found.';
  return message;
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/support');
  return { ok: true };
}

export async function createTicket(
  tenantId: string | null, subject: string, description: string, priority: string
): Promise<ActionResult> {
  if (!subject.trim()) return { ok: false, error: 'Subject is required.' };
  return rpc('cc_create_ticket', {
    p_tenant: tenantId || null, p_subject: subject, p_description: description, p_priority: priority,
  });
}

export async function setTicketStatus(ticketId: string, status: string): Promise<ActionResult> {
  return rpc('cc_set_ticket_status', { p_ticket: ticketId, p_status: status });
}

export async function logCall(
  tenantId: string | null, direction: string, phone: string, outcome: string, note: string
): Promise<ActionResult> {
  return rpc('cc_log_call', {
    p_tenant: tenantId || null, p_direction: direction, p_phone: phone,
    p_outcome: outcome, p_status: 'completed', p_note: note || null,
  });
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
