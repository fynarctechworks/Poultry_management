'use server';

// Control Center — plan management server actions (subscription:manage).
// All mutations run through the guarded, audited cc_* RPCs with the operator JWT.

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult } from './tenants';

function mapError(code: string | undefined, message: string): string {
  if (code === '42501') return 'You do not have permission to manage plans.';
  if (code === '23505') return 'That plan code already exists.';
  if (code === 'P0002') return 'Plan not found.';
  return message;
}

async function rpc(fn: string, args: Record<string, unknown>, planId?: string): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/subscriptions');
  if (planId) revalidatePath(`/admin/subscriptions/${planId}`);
  return { ok: true };
}

export async function createPlan(payload: Record<string, unknown>): Promise<ActionResult> {
  if (!payload.code || !payload.name) return { ok: false, error: 'Code and name are required.' };
  return rpc('cc_create_plan', { p_payload: payload });
}

export async function updatePlan(planId: string, payload: Record<string, unknown>): Promise<ActionResult> {
  return rpc('cc_update_plan', { p_plan: planId, p_payload: payload }, planId);
}

export async function setPlanActive(planId: string, active: boolean): Promise<ActionResult> {
  return rpc('cc_set_plan_active', { p_plan: planId, p_active: active }, planId);
}

export async function setPlanFeature(
  planId: string,
  featureCode: string,
  value: boolean | number | null
): Promise<ActionResult> {
  return rpc('cc_set_plan_feature', { p_plan: planId, p_feature_code: featureCode, p_value: value }, planId);
}

export async function duplicatePlan(planId: string, newCode: string, newName: string): Promise<ActionResult> {
  if (!newCode || !newName) return { ok: false, error: 'New code and name are required.' };
  return rpc('cc_duplicate_plan', { p_plan: planId, p_new_code: newCode, p_new_name: newName });
}
