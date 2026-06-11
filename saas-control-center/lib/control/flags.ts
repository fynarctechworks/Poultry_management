'use server';

// Control Center — feature flag server actions (flag:manage).
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult } from './tenants';

function mapError(code: string | undefined, message: string): string {
  if (code === '42501') return 'You do not have permission to manage feature flags.';
  if (code === '23505') return 'That flag key already exists.';
  if (code === 'P0002') return 'Flag not found.';
  return message;
}

export async function createFlag(
  key: string, name: string, description: string, enabled: boolean, rollout: number
): Promise<ActionResult> {
  if (!key.trim() || !name.trim()) return { ok: false, error: 'Key and name are required.' };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('cc_create_flag', {
    p_key: key.trim(), p_name: name.trim(), p_description: description || null,
    p_enabled: enabled, p_rollout: rollout,
  });
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/flags');
  return { ok: true };
}

export async function setFlag(flagId: string, enabled: boolean, rollout: number): Promise<ActionResult> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('cc_set_flag', {
    p_flag: flagId, p_enabled: enabled, p_rollout: rollout,
  });
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/flags');
  return { ok: true };
}
