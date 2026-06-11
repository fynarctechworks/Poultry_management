'use server';

// Control Center — discount management server actions (discount:manage) + a
// validation preview that reuses the same validate_coupon rule engine the
// tenant checkout uses.

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { ActionResult } from './tenants';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';

function mapError(code: string | undefined, message: string): string {
  if (code === '42501') return 'You do not have permission to manage discounts.';
  if (code === '23505') return 'That coupon code already exists.';
  if (code === 'P0002') return 'Discount not found.';
  return message;
}

export async function createDiscount(payload: Record<string, unknown>): Promise<ActionResult> {
  if (!payload.name || !payload.discount_type || !payload.value) {
    return { ok: false, error: 'Name, type and value are required.' };
  }
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('cc_create_discount', { p_payload: payload });
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/discounts');
  return { ok: true };
}

export async function createCoupon(
  discountId: string,
  code: string,
  maxPerTenant: number
): Promise<ActionResult> {
  if (!discountId || !code) return { ok: false, error: 'Select a discount and enter a code.' };
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.rpc('cc_create_coupon', {
    p_discount: discountId,
    p_code: code,
    p_max_per_tenant: maxPerTenant || 1,
  });
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  revalidatePath('/admin/discounts');
  return { ok: true };
}

export async function previewCoupon(
  code: string,
  planCode?: string
): Promise<ActionResult & { detail?: string }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('validate_coupon', {
    p_code: code,
    p_tenant: NIL_UUID,
    p_plan_code: planCode || null,
    p_is_first: null,
  });
  if (error) return { ok: false, error: mapError(error.code, error.message) };
  const res = data as { valid: boolean; reason?: string; discount_type?: string; value?: number };
  if (res.valid) {
    return { ok: true, detail: `Valid — ${res.value}${res.discount_type === 'percentage' ? '%' : '₹'} off.` };
  }
  return { ok: true, detail: `Invalid — ${res.reason}` };
}
