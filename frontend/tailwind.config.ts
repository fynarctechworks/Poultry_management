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
        ink: colors.ink,
        body: colors.body,
        'body-soft': colors.bodySoft,
        mute: colors.mute,
        'mute-soft': colors.muteSoft,
        canvas: colors.canvas,
        'canvas-soft': colors.canvasSoft,
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
      },
      fontFamily: {
        // --font-sans is provided by next/font (IBM Plex Sans, self-hosted) in app/layout.tsx
        sans: ['var(--font-sans)', 'IBM Plex Sans', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 4px 24px rgba(0,0,0,0.03)',
        micro: '0 1px 4px rgba(16,24,40,0.04)',
      },
    },
  },
  plugins: [],
};

export default config;
