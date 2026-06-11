// PoultryOS — onboarding draft sync + atomic workspace creation.
//
// Two responsibilities:
//  1. Auto-save / resume: mirror the on-device onboarding draft to the
//     server (`onboarding_progress`) so a half-finished signup survives a
//     device change. Local AsyncStorage (zustand persist) already handles
//     same-device resume; this is the cross-device backup.
//  2. Atomic creation: turn the collected draft into a single
//     `create_tenant_onboarding` RPC call (tenant + membership + profile +
//     farm + farm_user, all-or-nothing). Replaces the old 6-write sequence
//     in step 5 that left orphan farms on failure (audit P0-2) — and which
//     now also violates the tenant_id NOT NULL constraint.

import { supabase } from './supabase';
import { useOnboardingStore } from '../stores/onboarding';
import type { Farm } from '../stores/farm';

const CUSTOM_INTEGRATOR = '__custom__';

// ─── Draft sync (auto-save / resume) ──────────────────────────────────────────

export interface OnboardingDraft {
  current_step: number;
  draft_json: Record<string, unknown> | null;
  completed_at: string | null;
}

/** Snapshot the four data steps for server persistence. */
function snapshotDraft() {
  const s = useOnboardingStore.getState();
  return { step1: s.step1, step2: s.step2, step3: s.step3, step4: s.step4, step5: s.step5 };
}

/** Best-effort upsert of the current draft to the server. Never throws. */
export async function syncOnboardingDraft(currentStep: number): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from('onboarding_progress')
      .upsert(
        {
          user_id: user.id,
          current_step: Math.max(1, Math.min(10, currentStep)),
          draft_json: snapshotDraft(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
  } catch {
    // Auto-save is best-effort — local persist is the source of truth.
  }
}

/** Fetch any server-side draft for resume. Returns null if none / unauthenticated. */
export async function loadOnboardingDraft(): Promise<OnboardingDraft | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from('onboarding_progress')
      .select('current_step, draft_json, completed_at')
      .eq('user_id', user.id)
      .maybeSingle();
    return (data as OnboardingDraft) ?? null;
  } catch {
    return null;
  }
}

/**
 * Hydrate the local store from a server draft when the device has no local
 * progress yet (fresh install / different device). Only fills when the local
 * full_name is still blank, so we never clobber in-progress on-device edits.
 */
export async function hydrateDraftIfEmpty(): Promise<void> {
  const local = useOnboardingStore.getState();
  if (local.step1.full_name) return; // local progress wins
  const draft = await loadOnboardingDraft();
  const d = draft?.draft_json as any;
  if (!d) return;
  const store = useOnboardingStore.getState();
  if (d.step1) store.setStep1(d.step1);
  if (d.step2) store.setStep2(d.step2);
  if (d.step3) store.setStep3(d.step3);
  if (d.step4) store.setStep4(d.step4);
  if (d.step5) store.setStep5(d.step5);
}

// ─── Atomic workspace creation ────────────────────────────────────────────────

export interface CreateWorkspaceResult {
  tenant_id: string;
  farm_id: string;
  farm: Farm;
}

/**
 * Build the RPC payload from the onboarding store, resolving a custom
 * integrator to a real id first when needed.
 */
async function buildPayload(whatsappOptIn: boolean) {
  const { step1, step2, step3, step4, step5 } = useOnboardingStore.getState();

  let integratorId: string | null = null;
  if (step3.farm_type === 'contract') {
    if (step3.integrator_id === CUSTOM_INTEGRATOR) {
      const { data, error } = await supabase.rpc('create_custom_integrator', {
        p_name: step3.custom_integrator_name,
      });
      if (error) throw error;
      integratorId = data as string;
    } else {
      integratorId = step3.integrator_id;
    }
  }

  return {
    tenant_name: step2.farm_name,
    business_type: null,
    country: 'IN',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
    full_name: step1.full_name,
    whatsapp_phone: step5.whatsapp_phone,
    whatsapp_opt_in: whatsappOptIn,
    farm: {
      farm_name: step2.farm_name,
      owner_name: step2.owner_name,
      state: step2.state,
      district: step2.district,
      phone: step2.phone,
      gstin: step2.gstin || null,
      farm_type: step3.farm_type,
      integrator_id: integratorId,
      latitude: step4.latitude,
      longitude: step4.longitude,
      heat_stress_threshold_celsius: step4.heat_stress_threshold_celsius,
      upi_id: step5.upi_id || null,
    },
  };
}

/** Read back the freshly-created farm for the farm store. */
async function fetchFarm(farmId: string): Promise<Farm> {
  const { data, error } = await supabase
    .from('farms')
    .select('id,farm_name,owner_name,state,district,phone,farm_type,upi_id,heat_stress_threshold_celsius')
    .eq('id', farmId)
    .single();
  if (error) throw error;
  return data as Farm;
}

/**
 * Create the workspace atomically. If the tenant already exists (e.g. a retry
 * after a network blip where the RPC actually succeeded — Postgres error
 * 23505), recover gracefully by resolving the user's existing farm instead of
 * surfacing an error.
 */
export async function completeOnboarding(): Promise<CreateWorkspaceResult> {
  const whatsappOptIn = useOnboardingStore.getState().step5.whatsapp_opt_in;
  const payload = await buildPayload(whatsappOptIn);

  const { data, error } = await supabase.rpc('create_tenant_onboarding', { payload });

  if (error) {
    if (error.code === '23505') {
      const existing = await resolveExistingWorkspace();
      if (existing) return existing;
    }
    throw error;
  }

  const result = data as { tenant_id: string; farm_id: string };
  const farm = await fetchFarm(result.farm_id);
  return { tenant_id: result.tenant_id, farm_id: result.farm_id, farm };
}

/** Resolve the caller's already-created farm (used for idempotent retries). */
async function resolveExistingWorkspace(): Promise<CreateWorkspaceResult | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from('farm_users')
    .select('farm_id, tenant_id, farms(id,farm_name,owner_name,state,district,phone,farm_type,upi_id,heat_stress_threshold_celsius)')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!data?.farm_id || !data.farms || Array.isArray(data.farms)) return null;
  return {
    tenant_id: (data as any).tenant_id,
    farm_id: data.farm_id,
    farm: data.farms as unknown as Farm,
  };
}
