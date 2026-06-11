/**
 * onboarding-store.test.ts
 * Tests for PoultryOS/stores/onboarding.ts (Zustand store with persist middleware)
 * Surface: Jest (pure TS — no rendering needed)
 *
 * AsyncStorage is auto-mocked by jest-expo's setup; zustand persist is real
 * but storage writes are fire-and-forget in tests (we don't assert them).
 */

// Mock AsyncStorage before importing the store
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { act } from 'react';
import { useOnboardingStore } from '../../PoultryOS/stores/onboarding';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fresh store state before every test. */
function getStore() {
  return useOnboardingStore.getState();
}

function resetStore() {
  act(() => {
    useOnboardingStore.getState().reset();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  resetStore();
});

describe('onboarding store — setField', () => {
  it('setStep1 updates full_name without mutating other steps', () => {
    act(() => {
      getStore().setStep1({ full_name: 'Ravi Kumar' });
    });
    const s = getStore();
    expect(s.step1.full_name).toBe('Ravi Kumar');
    // other steps unchanged
    expect(s.step2.farm_name).toBe('');
  });

  it('setStep2 updates individual fields immutably', () => {
    act(() => {
      getStore().setStep2({ farm_name: 'Sunrise Poultry', state: 'Andhra Pradesh' });
    });
    const s = getStore();
    expect(s.step2.farm_name).toBe('Sunrise Poultry');
    expect(s.step2.state).toBe('Andhra Pradesh');
    // untouched fields retain defaults
    expect(s.step2.owner_name).toBe('');
    expect(s.step2.gstin).toBe('');
  });

  it('setStep3 updates farm_type and integrator_id', () => {
    const fakeId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    act(() => {
      getStore().setStep3({ farm_type: 'contract', integrator_id: fakeId });
    });
    const s = getStore();
    expect(s.step3.farm_type).toBe('contract');
    expect(s.step3.integrator_id).toBe(fakeId);
    expect(s.step3.custom_integrator_name).toBe('');
  });

  it('setStep4 updates heat_stress_threshold_celsius', () => {
    act(() => {
      getStore().setStep4({ heat_stress_threshold_celsius: 38.5 });
    });
    expect(getStore().step4.heat_stress_threshold_celsius).toBe(38.5);
  });

  it('setStep5 updates whatsapp_opt_in to false', () => {
    act(() => {
      getStore().setStep5({ whatsapp_opt_in: false, whatsapp_phone: '+919876543210' });
    });
    const s = getStore();
    expect(s.step5.whatsapp_opt_in).toBe(false);
    expect(s.step5.whatsapp_phone).toBe('+919876543210');
  });
});

describe('onboarding store — navigation', () => {
  it('goNext advances from step 1 to step 2', () => {
    expect(getStore().currentStep).toBe(1);
    act(() => { getStore().goNext(); });
    expect(getStore().currentStep).toBe(2);
  });

  it('goNext clamps at step 5 (does not go to 6)', () => {
    act(() => {
      // advance to step 5
      getStore().goNext(); // 2
      getStore().goNext(); // 3
      getStore().goNext(); // 4
      getStore().goNext(); // 5
      getStore().goNext(); // attempt 6 — should stay at 5
    });
    expect(getStore().currentStep).toBe(5);
  });

  it('goBack from step 1 stays at step 1', () => {
    expect(getStore().currentStep).toBe(1);
    act(() => { getStore().goBack(); });
    expect(getStore().currentStep).toBe(1);
  });

  it('goBack from step 3 goes to step 2', () => {
    act(() => {
      getStore().goNext(); // 2
      getStore().goNext(); // 3
      getStore().goBack(); // back to 2
    });
    expect(getStore().currentStep).toBe(2);
  });
});

describe('onboarding store — reset', () => {
  it('reset clears all fields and returns to step 1', () => {
    act(() => {
      getStore().setStep1({ full_name: 'Ravi' });
      getStore().setStep2({ farm_name: 'Some Farm' });
      getStore().goNext();
      getStore().goNext();
    });
    // Confirm state is dirty
    expect(getStore().step1.full_name).toBe('Ravi');
    expect(getStore().currentStep).toBe(3);

    act(() => { getStore().reset(); });

    const s = getStore();
    expect(s.currentStep).toBe(1);
    expect(s.step1.full_name).toBe('');
    expect(s.step2.farm_name).toBe('');
    expect(s.step3.farm_type).toBe('independent');
    expect(s.step4.heat_stress_threshold_celsius).toBe(35.0);
    expect(s.step5.whatsapp_opt_in).toBe(true);
  });
});
