// Manual mock for react-native-paper — avoids loading native modules in Jest.
// We only mock the components actually used by our UI primitives.

const React = require('react');
const { View, Text, TextInput: RNTextInput } = require('react-native');

const TextInput = React.forwardRef(function TextInput(props, ref) {
  const { label, value, onChangeText, testID, error, style, ...rest } = props;
  return React.createElement(
    RNTextInput,
    {
      ref,
      value,
      onChangeText,
      testID,
      style,
      accessibilityLabel: label,
      ...rest,
    },
  );
});
TextInput.displayName = 'TextInput';

function HelperText({ children, visible, style }) {
  if (!visible) return null;
  return React.createElement(Text, { style }, children);
}

module.exports = {
  TextInput,
  HelperText,
  Provider: ({ children }) => children,
};
