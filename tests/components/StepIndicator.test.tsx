/**
 * StepIndicator.test.tsx
 * Tests for PoultryOS/components/ui/StepIndicator.tsx
 * Surface: Jest + @testing-library/react-native
 *
 * Relies on testID="dot-filled" / testID="dot-muted" added to each dot View.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { StepIndicator } from '../../mobile-app/components/ui/StepIndicator';

describe('StepIndicator', () => {
  it('current=3 total=5 → 3 filled dots, 2 muted dots', () => {
    const { getAllByTestId } = render(<StepIndicator current={3} total={5} />);
    expect(getAllByTestId('dot-filled')).toHaveLength(3);
    expect(getAllByTestId('dot-muted')).toHaveLength(2);
  });

  it('caption reads "Step 3 of 5"', () => {
    const { getByText } = render(<StepIndicator current={3} total={5} />);
    expect(getByText('Step 3 of 5')).toBeTruthy();
  });

  it('edge: current=0 → 0 filled dots, all 5 muted', () => {
    const { queryAllByTestId } = render(<StepIndicator current={0} total={5} />);
    expect(queryAllByTestId('dot-filled')).toHaveLength(0);
    expect(queryAllByTestId('dot-muted')).toHaveLength(5);
  });

  it('edge: current=total → all dots filled, none muted', () => {
    const { getAllByTestId, queryAllByTestId } = render(
      <StepIndicator current={4} total={4} />,
    );
    expect(getAllByTestId('dot-filled')).toHaveLength(4);
    expect(queryAllByTestId('dot-muted')).toHaveLength(0);
  });

  it('progressbar role carries correct accessibility values', () => {
    const { getByRole } = render(<StepIndicator current={2} total={5} />);
    const bar = getByRole('progressbar');
    expect(bar.props.accessibilityValue).toEqual({ min: 1, max: 5, now: 2 });
  });
});
