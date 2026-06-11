import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OnboardingStep1 {
  full_name: string;
}

export interface OnboardingStep2 {
  farm_name: string;
  owner_name: string;
  state: string;
  district: string;
  phone: string;
  gstin: string;
}

export interface OnboardingStep3 {
  farm_type: 'independent' | 'contract';
  integrator_id: string | null;
  custom_integrator_name: string;
}

export interface OnboardingStep4 {
  latitude: number | null;
  longitude: number | null;
  heat_stress_threshold_celsius: number;
}

export interface OnboardingStep5 {
  whatsapp_phone: string;
  whatsapp_opt_in: boolean;
  upi_id: string;
}

interface OnboardingState {
  currentStep: 1 | 2 | 3 | 4 | 5;
  step1: OnboardingStep1;
  step2: OnboardingStep2;
  step3: OnboardingStep3;
  step4: OnboardingStep4;
  step5: OnboardingStep5;
  setStep1: (data: Partial<OnboardingStep1>) => void;
  setStep2: (data: Partial<OnboardingStep2>) => void;
  setStep3: (data: Partial<OnboardingStep3>) => void;
  setStep4: (data: Partial<OnboardingStep4>) => void;
  setStep5: (data: Partial<OnboardingStep5>) => void;
  goNext: () => void;
  goBack: () => void;
  reset: () => void;
}

const defaultState = {
  currentStep: 1 as const,
  step1: { full_name: '' },
  step2: {
    farm_name: '',
    owner_name: '',
    state: '',
    district: '',
    phone: '',
    gstin: '',
  },
  step3: {
    farm_type: 'independent' as const,
    integrator_id: null,
    custom_integrator_name: '',
  },
  step4: {
    latitude: null,
    longitude: null,
    heat_stress_threshold_celsius: 35.0,
  },
  step5: {
    whatsapp_phone: '',
    whatsapp_opt_in: true,
    upi_id: '',
  },
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...defaultState,
      setStep1: (data) =>
        set((s) => ({ step1: { ...s.step1, ...data } })),
      setStep2: (data) =>
        set((s) => ({ step2: { ...s.step2, ...data } })),
      setStep3: (data) =>
        set((s) => ({ step3: { ...s.step3, ...data } })),
      setStep4: (data) =>
        set((s) => ({ step4: { ...s.step4, ...data } })),
      setStep5: (data) =>
        set((s) => ({ step5: { ...s.step5, ...data } })),
      goNext: () => {
        const current = get().currentStep;
        if (current < 5) {
          set({ currentStep: (current + 1) as 1 | 2 | 3 | 4 | 5 });
        }
      },
      goBack: () => {
        const current = get().currentStep;
        if (current > 1) {
          set({ currentStep: (current - 1) as 1 | 2 | 3 | 4 | 5 });
        }
      },
      reset: () => set(defaultState),
    }),
    {
      name: '@onboarding_draft_v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
