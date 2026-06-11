/**
 * InventoryItemCard.test.tsx
 *
 * Tests the InventoryItemCard UI primitive:
 *   - renders item name and "<currentStock> <unit>" stock text
 *   - shows "Low stock" pill when currentStock <= lowStockThreshold AND lowStockThreshold > 0
 *   - hides the pill when currentStock is above threshold
 *   - hides the pill when lowStockThreshold is 0 even if currentStock is also 0
 *   - pressable variant has accessibilityRole="button" when onPress is provided
 *   - forwards testID to the outermost container
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { InventoryItemCard } from '../../PoultryOS/components/ui/InventoryItemCard';

const BASE_PROPS = {
  itemName: 'Grower Feed',
  category: 'feed' as const,
  unit: 'kg' as const,
  currentStock: 200,
  lowStockThreshold: 50,
};

describe('InventoryItemCard', () => {
  it('renders the item name', () => {
    const { getByText } = render(<InventoryItemCard {...BASE_PROPS} />);
    expect(getByText('Grower Feed')).toBeTruthy();
  });

  it('renders the stock text as "<currentStock> <unit>"', () => {
    const { getByText } = render(<InventoryItemCard {...BASE_PROPS} />);
    expect(getByText('200 kg')).toBeTruthy();
  });

  it('shows "Low stock" pill when currentStock equals lowStockThreshold', () => {
    const { getByText } = render(
      <InventoryItemCard {...BASE_PROPS} currentStock={50} lowStockThreshold={50} />,
    );
    expect(getByText('Low stock')).toBeTruthy();
  });

  it('shows "Low stock" pill when currentStock is below lowStockThreshold', () => {
    const { getByText } = render(
      <InventoryItemCard {...BASE_PROPS} currentStock={10} lowStockThreshold={50} />,
    );
    expect(getByText('Low stock')).toBeTruthy();
  });

  it('hides the "Low stock" pill when currentStock is above lowStockThreshold', () => {
    const { queryByText } = render(
      <InventoryItemCard {...BASE_PROPS} currentStock={200} lowStockThreshold={50} />,
    );
    expect(queryByText('Low stock')).toBeNull();
  });

  it('hides the "Low stock" pill when lowStockThreshold is 0 even if currentStock is 0', () => {
    const { queryByText } = render(
      <InventoryItemCard {...BASE_PROPS} currentStock={0} lowStockThreshold={0} />,
    );
    expect(queryByText('Low stock')).toBeNull();
  });

  it('has accessibilityRole="button" on the container when onPress is provided', () => {
    const { getByRole } = render(
      <InventoryItemCard {...BASE_PROPS} onPress={() => {}} />,
    );
    expect(getByRole('button')).toBeTruthy();
  });

  it('does not expose accessibilityRole="button" when onPress is omitted', () => {
    const { queryByRole } = render(<InventoryItemCard {...BASE_PROPS} />);
    expect(queryByRole('button')).toBeNull();
  });

  it('forwards testID to the outermost container', () => {
    const { getByTestId } = render(
      <InventoryItemCard {...BASE_PROPS} testID="inv-card-1" />,
    );
    expect(getByTestId('inv-card-1')).toBeTruthy();
  });

  it('forwards testID when onPress is provided', () => {
    const { getByTestId } = render(
      <InventoryItemCard {...BASE_PROPS} onPress={() => {}} testID="inv-card-pressable" />,
    );
    expect(getByTestId('inv-card-pressable')).toBeTruthy();
  });
});
