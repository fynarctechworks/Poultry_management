import { ReactNode } from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, spacing, radius } from '../../theme/tokens';

export interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export function Card({ children, onPress, style, testID }: CardProps) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessible
        accessibilityRole="button"
        testID={testID}
        style={({ pressed }) => [
          styles.card,
          pressed && styles.pressed,
          style,
        ]}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, style]} testID={testID}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.mute,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  pressed: {
    opacity: 0.85,
  },
});
