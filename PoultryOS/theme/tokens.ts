// Auto-derived from DESIGN.md (Kraken-inspired system) — keep in sync manually.
// STRICT RULE: This is the ONLY file in the project that may contain hex literals.
// All other files import from here.

export const colors = {
  // Kraken Purple brand scale
  primary: '#7132f5',
  primaryDark: '#5741d8',
  primaryDeep: '#5b1ecf',
  primarySubtle: 'rgba(133,91,251,0.16)',
  onPrimary: '#ffffff',
  // Neutral scale (near-black + cool blue-grays)
  ink: '#101114',
  body: '#686b82',
  bodySoft: '#9497a9',
  mute: '#dedee5',
  muteSoft: 'rgba(148,151,169,0.08)',
  canvas: '#ffffff',
  canvasSoft: '#f7f7fa',
  onDark: '#ffffff',
  // Semantic
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
  // Money-state aliases — payment pending/partial chips get NAMED tokens so
  // they are never improvised per page (blueprint §3.2, fixes D2)
  pendingInk: '#92400E',
  pendingSoft: '#FEF3C7',
  // Offline banner (formalizes the yellow strip)
  offlineInk: '#B45309',
  offlineBg: '#FEF3C7',
  // Modal / sheet backdrop
  overlay: 'rgba(16,17,20,0.4)',
  // PoultryOS domain overlay (kept — not in DESIGN.md but required by spec)
  whatsapp: '#25D366',
  heat: '#EA580C',
  upi: '#5B21B6',
} as const;

// Kraken uses Kraken-Brand (display) + Kraken-Product (UI). We substitute IBM Plex Sans
// (the documented fallback). On native, expo-font registers each static weight under its
// own family name — RN needs exact names, not CSS stacks (blueprint §3.1).
export const fontFamily = 'IBM Plex Sans, Helvetica Neue, Helvetica, Arial, sans-serif';
export const fontFamilyDisplay = 'IBM Plex Sans, Helvetica, Arial, sans-serif';

export const fonts = {
  regular: 'IBMPlexSans_400Regular',
  medium: 'IBMPlexSans_500Medium',
  semibold: 'IBMPlexSans_600SemiBold',
  bold: 'IBMPlexSans_700Bold',
} as const;

export const typography = {
  // Display scale — Kraken-Brand, bold (700), negative tracking
  displayHero: { fontSize: 48, lineHeight: 56, fontWeight: '700' as const, letterSpacing: -1, fontFamily: fonts.bold },
  displayXxl:  { fontSize: 40, lineHeight: 48, fontWeight: '700' as const, letterSpacing: -0.5, fontFamily: fonts.bold },
  displayXl:   { fontSize: 36, lineHeight: 44, fontWeight: '700' as const, letterSpacing: -0.5, fontFamily: fonts.bold },
  displayLg:   { fontSize: 28, lineHeight: 36, fontWeight: '700' as const, letterSpacing: -0.5, fontFamily: fonts.bold },
  displayMd:   { fontSize: 24, lineHeight: 32, fontWeight: '700' as const, fontFamily: fonts.bold },
  displaySm:   { fontSize: 22, lineHeight: 28, fontWeight: '600' as const, fontFamily: fonts.semibold },
  displayXs:   { fontSize: 18, lineHeight: 24, fontWeight: '600' as const, fontFamily: fonts.semibold },
  // Body scale — Kraken-Product, 16/14/12 ladder, line-height 1.38
  bodyLg:        { fontSize: 18, lineHeight: 26, fontWeight: '400' as const, fontFamily: fonts.regular },
  bodyMd:        { fontSize: 16, lineHeight: 22, fontWeight: '400' as const, fontFamily: fonts.regular },
  bodyMdStrong:  { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, fontFamily: fonts.semibold },
  bodySm:        { fontSize: 14, lineHeight: 20, fontWeight: '400' as const, fontFamily: fonts.regular },
  bodySmStrong:  { fontSize: 14, lineHeight: 20, fontWeight: '600' as const, fontFamily: fonts.semibold },
  // Label / metadata scale
  caption:          { fontSize: 14, lineHeight: 20, fontWeight: '400' as const, fontFamily: fonts.regular },
  captionStrong:    { fontSize: 14, lineHeight: 20, fontWeight: '700' as const, fontFamily: fonts.bold },
  captionUppercase: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const, fontFamily: fonts.medium },
  eyebrowUppercase: { fontSize: 12, lineHeight: 16, fontWeight: '700' as const, letterSpacing: 0.5, textTransform: 'uppercase' as const, fontFamily: fonts.bold },
  // Interactive
  buttonMd: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const, fontFamily: fonts.semibold },
} as const;

// Kraken spacing ladder: 1/2/3/4/5/6/8/10/12/13/15/16/20/24/25.
// We expose the named tokens callers already use; values are aligned to that ladder.
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

// Kraken radius ladder: 3/6/8/10/12/16/9999/50%. "Don't use pill buttons — 12px max."
// The pillMd/pillLg tokens are kept as names so existing callers compile, but their
// values are remapped to the new 12px button radius per the new design rules.
export const radius = {
  none: 0,
  xs: 3,
  sm: 6,
  md: 8,
  lg: 12,
  card: 16,
  pillMd: 12,
  pillLg: 12,
  full: 9999,
} as const;

// Kraken elevation — "whisper level" shadows
export const elevation = {
  subtle: {
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  micro: {
    shadowColor: '#101828',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} as const;

// State & interaction tokens (blueprint §3.3) — pressed feedback, focus rings,
// disabled treatment, and motion durations. Reduced-motion: respect OS setting;
// skeleton shimmer falls back to a static block.
export const state = {
  pressedOpacity: 0.92,      // 8% ink overlay equivalent
  pressedScale: 0.98,
  disabledOpacity: 0.4,
  focusRingWidth: 2,
  focusRingOffset: 2,
} as const;

export const motion = {
  fast: 120,     // hover, press
  base: 200,     // panels, accordions
  entrance: 240, // modals, sheets (+8px translate-y)
} as const;

export const tokens = { colors, typography, spacing, radius, elevation, state, motion, fonts } as const;
export default tokens;
