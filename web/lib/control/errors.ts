'use server';

// Control Center — error monitoring server actions (error:manage).
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult } from './tenants';

function mapError(code: string | undefined, message: string): string {
  if (code === '42501') return 'You do not have permission to triage errors.';
  if (code === 'P0002') return 'Error not found.';
  return message;
}

async function rpc(fn: string, args: Record<string, unknown>, errorId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/errors');
  revalidatePath(`/admin/errors/${errorId}`);
  return { ok: true };
}

export async function setErrorStatus(errorId: string, status: string): Promise<ActionResult> {
  return rpc('cc_set_error_status', { p_error: errorId, p_status: status }, errorId);
}

export async function assignErrorToMe(errorId: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };
  return rpc('cc_assign_error', { p_error: errorId, p_assignee: user.id }, errorId);
}

export async function addErrorComment(errorId: string, comment: string): Promise<ActionResult> {
  if (!comment.trim()) return { ok: false, error: 'Comment cannot be empty.' };
  return rpc('cc_add_error_comment', { p_error: errorId, p_comment: comment }, errorId);
}
