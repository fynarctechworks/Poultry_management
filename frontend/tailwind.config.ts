import type { Config } from 'tailwindcss';
import { colors, radius, spacing } from './lib/theme/tokens';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: colors.primary,
        'primary-dark': colors.primaryDark,
        'primary-deep': colors.primaryDeep,
        'primary-subtle': colors.primarySubtle,
        'on-primary': colors.onPrimary,
        'on-dark': colors.onDark,
        'on-dark-soft': colors.onDarkSoft,
        ink: colors.ink,
        body: colors.body,
        'body-soft': colors.bodySoft,
        mute: colors.mute,
        'mute-soft': colors.muteSoft,
        canvas: colors.canvas,
        'canvas-soft': colors.canvasSoft,
        // ElevenLabs surface + hairline scale
        'surface-strong': colors.surfaceStrong,
        'surface-dark': colors.surfaceDark,
        'surface-dark-elevated': colors.surfaceDarkElevated,
        hairline: colors.mute,
        'hairline-soft': colors.hairlineSoft,
        'hairline-strong': colors.hairlineStrong,
        muted: colors.muted,
        'muted-soft': colors.mutedSoft,
        success: colors.success,
        'success-ink': colors.successInk,
        'success-soft': colors.successSoft,
        danger: colors.danger,
        warning: colors.warning,
        'warning-soft': colors.warningSoft,
        'warning-ink': colors.warningInk,
        info: colors.info,
        'info-soft': colors.infoSoft,
        'pending-ink': colors.pendingInk,
        'pending-soft': colors.pendingSoft,
        'offline-ink': colors.offlineInk,
        'offline-bg': colors.offlineBg,
        // Atmospheric gradient orb stops (decoration only)
        'gradient-mint': colors.gradientMint,
        'gradient-peach': colors.gradientPeach,
        'gradient-lavender': colors.gradientLavender,
        'gradient-sky': colors.gradientSky,
        'gradient-rose': colors.gradientRose,
        whatsapp: colors.whatsapp,
        heat: colors.heat,
        upi: colors.upi,
      },
      transitionDuration: {
        fast: '120ms',
        base: '200ms',
        entrance: '240ms',
      },
      borderRadius: {
        none: `${radius.none}px`,
        xs: `${radius.xs}px`,
        sm: `${radius.sm}px`,
        md: `${radius.md}px`,
        lg: `${radius.lg}px`,
        card: `${radius.card}px`,
        xl: `${radius.xl}px`,
        xxl: `${radius.xxl}px`,
        pill: '9999px',
        full: '9999px',
      },
      spacing: {
        xxs: `${spacing.xxs}px`,
        xs: `${spacing.xs}px`,
        sm: `${spacing.sm}px`,
        md: `${spacing.md}px`,
        lg: `${spacing.lg}px`,
        xl: `${spacing.xl}px`,
        '2xl': `${spacing['2xl']}px`,
        '3xl': `${spacing['3xl']}px`,
        xxl: `${spacing.xxl}px`,
        section: `${spacing.section}px`,
      },
      fontFamily: {
        // --font-sans (Inter) + --font-display (EB Garamond Light) via next/font in app/layout.tsx
        sans: ['var(--font-sans)', 'Inter', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        display: ['var(--font-display)', 'EB Garamond', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        // ElevenLabs: single soft-drop tier — hairline + one subtle shadow.
        subtle: '0 4px 16px rgba(0,0,0,0.04)',
        micro: '0 2px 8px rgba(0,0,0,0.03)',
      },
    },
  },
  plugins: [],
};

export default config;
