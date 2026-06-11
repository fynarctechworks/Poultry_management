/**
 * TextInput.test.tsx
 * Tests for PoultryOS/components/ui/TextInput.tsx
 * Surface: Jest + @testing-library/react-native
 *
 * react-native-paper is mocked in PoultryOS/__mocks__/react-native-paper.js
 * so this test runs without native modules.
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TextInput } from '../../PoultryOS/components/ui/TextInput';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderInput(overrides: Partial<React.ComponentProps<typeof TextInput>> = {}) {
  const props = {
    label: 'Farm Name',
    value: '',
    onChangeText: jest.fn(),
    ...overrides,
  };
  return render(<TextInput {...props} />);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TextInput', () => {
  it('always renders the label text above the field', () => {
    const { getByText } = renderInput({ label: 'Phone Number' });
    expect(getByText('Phone Number')).toBeTruthy();
  });

  it('calls onChangeText when the value changes', () => {
    const onChangeText = jest.fn();
    const { getByTestId } = renderInput({ onChangeText, testID: 'farm-input' });
    fireEvent.changeText(getByTestId('farm-input'), 'My Farm');
    expect(onChangeText).toHaveBeenCalledWith('My Farm');
  });

  it('does not render helper text when error is absent', () => {
    const { queryByText } = renderInput({ label: 'State' });
    // No error text should appear
    expect(queryByText(/required/i)).toBeNull();
  });

  it('renders error helper text when error prop is provided', () => {
    const { getByText } = renderInput({ error: 'This field is required' });
    expect(getByText('This field is required')).toBeTruthy();
  });

  it('does not render helper text when error is empty string', () => {
    const { queryByText } = renderInput({ error: '' });
    // Falsy error → HelperText block should not be rendered
    expect(queryByText('')).toBeNull();
  });
});
