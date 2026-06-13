/**
 * Button.test.tsx
 * Tests for PoultryOS/components/ui/Button.tsx
 * Surface: Jest + @testing-library/react-native
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../../mobile-app/components/ui/Button';
import { colors, radius } from '../../mobile-app/theme/tokens';

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderButton(props: Partial<React.ComponentProps<typeof Button>> & { label?: string } = {}) {
  const onPress = props.onPress ?? jest.fn();
  return render(
    <Button label={props.label ?? 'Test'} onPress={onPress} {...props} />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Button', () => {
  it('renders its label text', () => {
    const { getByText } = renderButton({ label: 'Continue' });
    expect(getByText('Continue')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByRole } = renderButton({ onPress });
    fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled=true: accessibilityState.disabled is true', () => {
    const onPress = jest.fn();
    const { getByRole } = renderButton({ onPress, disabled: true });
    const btn = getByRole('button');
    expect(btn.props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('shows ActivityIndicator when loading=true, hides label text', () => {
    const { queryByText, UNSAFE_getByType } = renderButton({
      loading: true,
      label: 'Wait',
      testID: 'loading-btn',
    });
    // Label text should be hidden
    expect(queryByText('Wait')).toBeNull();
    // ActivityIndicator is rendered
    const { ActivityIndicator } = require('react-native');
    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('loading=true: accessibilityState shows busy=true and disabled=true', () => {
    const { getByRole } = renderButton({ loading: true, label: 'Wait' });
    const btn = getByRole('button');
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('variant="primary" applies colors.primary as backgroundColor', () => {
    const { getByRole } = renderButton({ variant: 'primary' });
    const btn = getByRole('button');
    // Style prop is an array of style objects; flatten and search
    const flatStyles = [btn.props.style].flat(Infinity);
    const bgStyle = flatStyles.find(
      (s: Record<string, unknown>) => s && typeof s === 'object' && 'backgroundColor' in s,
    );
    expect(bgStyle).toBeDefined();
    expect((bgStyle as Record<string, unknown>).backgroundColor).toBe(colors.primary);
  });

  it('variant="outlineRed" applies transparent background with colors.primary border', () => {
    const { getByRole } = renderButton({ variant: 'outlineRed' });
    const btn = getByRole('button');
    const flatStyles = [btn.props.style].flat(Infinity);
    const containerStyle = flatStyles.find(
      (s: Record<string, unknown>) => s && typeof s === 'object' && 'borderColor' in s,
    );
    expect(containerStyle).toBeDefined();
    expect((containerStyle as Record<string, unknown>).borderColor).toBe(colors.primary);
    // Background should be canvas (white), not primary
    const bgStyle = flatStyles.find(
      (s: Record<string, unknown>) => s && typeof s === 'object' && 'backgroundColor' in s,
    );
    expect((bgStyle as Record<string, unknown>)?.backgroundColor).not.toBe(colors.primary);
  });

  it('snapshot: base style has pill-shaped borderRadius of 60', () => {
    const { getByRole } = renderButton({ variant: 'primary', label: 'Pill' });
    const btn = getByRole('button');
    const flatStyles = [btn.props.style].flat(Infinity);
    const radiusStyle = flatStyles.find(
      (s: Record<string, unknown>) => s && typeof s === 'object' && 'borderRadius' in s,
    );
    expect(radiusStyle).toBeDefined();
    expect((radiusStyle as Record<string, unknown>).borderRadius).toBe(radius.pillLg); // 60
  });
});
