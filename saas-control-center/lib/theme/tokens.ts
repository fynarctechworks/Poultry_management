// Mirror of mobile-app/theme/tokens.ts — kept in sync manually.
// STRICT RULE: this is the ONLY file in the web app that may contain hex literals.
//
// Design language (DESIGN.md): ElevenLabs editorial — off-white canvas, warm near-black
// ink, NO saturated CTA color. Primary action = ink pill. Display = EB Garamond Light (300).
// Body = Inter. Brand voltage = pastel gradient orbs (atmospheric decoration only).

export const colors = {
  primary: '#292524',       // ink pill (primary CTA)
  primaryDark: '#0c0a09',   // press / hover
  primaryDeep: '#0c0a09',
  primarySubtle: 'rgba(41,37,36,0.08)',
  onPrimary: '#ffffff',
  ink: '#0c0a09',
  body: '#4e4e4e',
  bodySoft: '#777169',
  mute: '#e7e5e4',
  muteSoft: 'rgba(120,113,108,0.08)',
  canvas: '#ffffff',
  canvasSoft: '#f5f5f5',
  onDark: '#ffffff',
  // Additive surface + hairline tokens
  surfaceStrong: '#f0efed',
  surfaceDark: '#0c0a09',
  surfaceDarkElevated: '#1c1917',
  hairlineSoft: '#f0efed',
  hairlineStrong: '#d6d3d1',
  muted: '#777169',
  mutedSoft: '#a8a29e',
  onDarkSoft: '#a8a29e',
  // Semantic
  success: '#16a34a',
  successInk: '#15803d',
  successSoft: 'rgba(22,163,74,0.12)',
  danger: '#dc2626',
  warning: '#92400E',
  warningSoft: '#FEF3C7',
  warningInk: '#92400E',
  info: '#1d4ed8',
  infoSoft: 'rgba(29,78,216,0.12)',
  pendingInk: '#92400E',
  pendingSoft: '#FEF3C7',
  offlineInk: '#B45309',
  offlineBg: '#FEF3C7',
  overlay: 'rgba(12,10,9,0.4)',
  // Atmospheric gradient orb stops (signature) — decoration ONLY.
  gradientMint: '#a7e5d3',
  gradientPeach: '#f4c5a8',
  gradientLavender: '#c8b8e0',
  gradientSky: '#a8c8e8',
  gradientRose: '#e8b8c4',
  // Domain overlay
  whatsapp: '#25D366',
  heat: '#EA580C',
  upi: '#5B21B6',
  // Control Center auth-panel atmospheric aurora — repointed from purple glow to
  // pastel orb stops (lavender + sky) so the panel reads ElevenLabs, not Kraken.
  primaryGlow: '#c8b8e0',
  primaryHaze: '#a8c8e8',
} as const;

// Motion durations (ms)
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
  xxl: 48,
  section: 96,
} as const;

export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  card: 16,
  xl: 16,
  xxl: 24,
  pill: 9999,
  full: 9999,
} as const;
