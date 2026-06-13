// Mirror of PoultryOS/theme/tokens.ts — kept in sync manually.
// STRICT RULE: this is the ONLY file in the web app that may contain hex literals.

export const colors = {
  primary: '#7132f5',
  primaryDark: '#5741d8',
  primaryDeep: '#5b1ecf',
  primarySubtle: 'rgba(133,91,251,0.16)',
  onPrimary: '#ffffff',
  ink: '#101114',
  body: '#686b82',
  bodySoft: '#9497a9',
  mute: '#dedee5',
  muteSoft: 'rgba(148,151,169,0.08)',
  canvas: '#ffffff',
  canvasSoft: '#f7f7fa',
  onDark: '#ffffff',
  success: '#149e61',
  successInk: '#026b3f',
  successSoft: 'rgba(20,158,97,0.16)',
  danger: '#9B1C1C',
  warning: '#92400E',
  warningSoft: '#FEF3C7',
  warningInk: '#92400E',
  // Info — neutral notices, sync status (blueprint §3.2)
  info: '#1d4ed8',
  infoSoft: 'rgba(29,78,216,0.12)',
  // Money-state aliases — pending/partial payment chips (named, never improvised)
  pendingInk: '#92400E',
  pendingSoft: '#FEF3C7',
  // Offline banner
  offlineInk: '#B45309',
  offlineBg: '#FEF3C7',
  // Modal / sheet backdrop
  overlay: 'rgba(16,17,20,0.4)',
  whatsapp: '#25D366',
  heat: '#EA580C',
  upi: '#5B21B6',
  // Brand aurora gradient stops (Control Center auth panel) — light purple tints
  primaryGlow: '#a98cff',
  primaryHaze: '#c9b6ff',
} as const;

// Motion durations (ms) — blueprint §3.3
export const motion = {
  fast: 120,
  base: 200,
  entrance: 240,
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
} as const;

export const radius = {
  none: 0,
  xs: 3,
  sm: 6,
  md: 8,
  lg: 12,
  card: 16,
  full: 9999,
} as const;
