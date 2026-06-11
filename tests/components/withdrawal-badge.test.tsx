/**
 * withdrawal-badge.test.tsx
 *
 * Tests the date logic of WithdrawalBadge — the medicine-withdrawal status
 * chip derived from health_incidents.withdrawal_clearance_date.
 */

import React from 'react';
import { render } from '@testing-library/react-native';
import { WithdrawalBadge } from '../../PoultryOS/components/ui/WithdrawalBadge';

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('WithdrawalBadge', () => {
  it('renders nothing when clearanceDate is null', () => {
    const { toJSON } = render(<WithdrawalBadge clearanceDate={null} />);
    expect(toJSON()).toBeNull();
  });

  it('shows "Withdrawal cleared" for a past clearance date', () => {
    const { getByText } = render(
      <WithdrawalBadge clearanceDate={isoDaysFromNow(-5)} />,
    );
    expect(getByText('Withdrawal cleared')).toBeTruthy();
  });

  it('shows "Withdrawal cleared" when the clearance date is today', () => {
    const { getByText } = render(
      <WithdrawalBadge clearanceDate={isoDaysFromNow(0)} />,
    );
    expect(getByText('Withdrawal cleared')).toBeTruthy();
  });

  it('shows a pending "Withdrawal until ..." chip for a future clearance date', () => {
    const { getByText } = render(
      <WithdrawalBadge clearanceDate={isoDaysFromNow(7)} />,
    );
    // Exact formatted date varies; assert the prefix is present
    expect(getByText(/^Withdrawal until /)).toBeTruthy();
  });

  it('compares only the date portion of an ISO datetime string', () => {
    // A datetime far in the past, with a time component, must still read cleared
    const { getByText } = render(
      <WithdrawalBadge clearanceDate="2020-01-01T23:59:59Z" />,
    );
    expect(getByText('Withdrawal cleared')).toBeTruthy();
  });

  it('forwards testID to the chip container', () => {
    const { getByTestId } = render(
      <WithdrawalBadge clearanceDate={isoDaysFromNow(-1)} testID="wb-1" />,
    );
    expect(getByTestId('wb-1')).toBeTruthy();
  });
});
