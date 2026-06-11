import { MD3LightTheme } from 'react-native-paper';
import { colors } from './tokens';

export { colors, typography, spacing, radius, elevation, tokens } from './tokens';
export { fontFamily, fontFamilyDisplay } from './tokens';

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    onPrimary: colors.onPrimary,
    primaryContainer: colors.canvasSoft,
    onPrimaryContainer: colors.ink,
    secondary: colors.ink,
    onSecondary: colors.onDark,
    error: colors.danger,
    onError: colors.onDark,
    background: colors.canvasSoft,
    onBackground: colors.ink,
    surface: colors.canvas,
    onSurface: colors.ink,
    surfaceVariant: colors.canvasSoft,
    onSurfaceVariant: colors.body,
    outline: colors.mute,
    outlineVariant: colors.mute,
  },
} as const;
