// Auto-derived from DESIGN.md (ElevenLabs-inspired editorial system) — keep in sync manually.
// STRICT RULE: This is the ONLY file in the project that may contain hex literals.
// All other files import from here.
//
// Design language: off-white canvas, warm near-black ink, NO saturated CTA color.
// Primary action = ink pill. Display = EB Garamond Light (300) serif. Body = Inter.
// Brand voltage = pastel gradient orbs (atmospheric decoration only — never fills/text).
//
// Token NAMES are intentionally preserved from the prior system so the ~200 consuming
// files compile unchanged; only VALUES are remapped to the ElevenLabs palette, plus a
// few additive tokens (gradient orbs, surfaceStrong, hairlineStrong, radius.pill).

export const colors = {
  // Primary action — warm near-black "ink pill". NOT a saturated brand color.
  primary: '#292524',
  primaryDark: '#0c0a09',   // press / hover state (button-primary-active)
  primaryDeep: '#0c0a09',   // darkest ink
  primarySubtle: 'rgba(41,37,36,0.08)', // subtle ink wash for tertiary buttons
  onPrimary: '#ffffff',
  // Neutral scale (warm near-black + warm grays)
  ink: '#0c0a09',           // display + primary text
  body: '#4e4e4e',          // default running text
  bodySoft: '#777169',      // muted sub-titles
  mute: '#e7e5e4',          // default hairline / divider
  muteSoft: 'rgba(120,113,108,0.08)',
  canvas: '#ffffff',        // pure-white card surface (surface-card)
  canvasSoft: '#f5f5f5',    // off-white page floor (the ElevenLabs canvas)
  onDark: '#ffffff',
  // Additive surface + hairline tokens (DESIGN.md)
  surfaceStrong: '#f0efed', // badges, voice-icon plates
  surfaceDark: '#0c0a09',   // dark hero / CTA band
  surfaceDarkElevated: '#1c1917', // cards on dark canvas
  hairlineSoft: '#f0efed',
  hairlineStrong: '#d6d3d1',
  muted: '#777169',
  mutedSoft: '#a8a29e',     // disabled text
  onDarkSoft: '#a8a29e',
  // Semantic
  success: '#16a34a',
  successInk: '#15803d',
  successSoft: 'rgba(22,163,74,0.12)',
  danger: '#dc2626',
  warning: '#92400E',
  warningSoft: '#FEF3C7',
  warningInk: '#92400E',
  // Info — neutral notices, sync status
  info: '#1d4ed8',
  infoSoft: 'rgba(29,78,216,0.12)',
  // Money-state aliases — payment pending/partial chips get NAMED tokens so
  // they are never improvised per page.
  pendingInk: '#92400E',
  pendingSoft: '#FEF3C7',
  // Offline banner (formalizes the yellow strip)
  offlineInk: '#B45309',
  offlineBg: '#FEF3C7',
  // Modal / sheet backdrop
  overlay: 'rgba(12,10,9,0.4)',
  // Atmospheric gradient orb stops (signature) — decoration ONLY: radial blooms
  // behind hero/feature copy. Never button fills, never text colors.
  gradientMint: '#a7e5d3',
  gradientPeach: '#f4c5a8',
  gradientLavender: '#c8b8e0',
  gradientSky: '#a8c8e8',
  gradientRose: '#e8b8c4',
  // PoultryOS domain overlay (kept — not in DESIGN.md but required by spec)
  whatsapp: '#25D366',
  heat: '#EA580C',
  upi: '#5B21B6',
} as const;

// Display = EB Garamond (Waldenburg Light substitute) at weight 300 — editorial signature.
// Body/UI = Inter at 400/500. On native, expo-font registers each static weight under its
// own family name — RN needs exact names, not CSS stacks.
export const fontFamily = 'Inter, Helvetica Neue, Helvetica, Arial, sans-serif';
export const fontFamilyDisplay = "'EB Garamond', 'Times New Roman', serif";

export const fonts = {
  // Body / UI — Inter
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  // Display — EB Garamond Light (editorial serif, weight 300)
  display: 'EBGaramond_400Regular',
  displayLight: 'EBGaramond_500Medium',
} as const;

export const typography = {
  // Display scale — EB Garamond, LIGHT weight, negative tracking (editorial voice).
  // Never bold display copy. Sizes scaled down slightly from the marketing spec for
  // small-screen Android legibility while preserving the 64→24 ladder shape.
  displayHero: { fontSize: 48, lineHeight: 52, fontWeight: '300' as const, letterSpacing: -1.2, fontFamily: fonts.display },
  displayXxl:  { fontSize: 40, lineHeight: 44, fontWeight: '300' as const, letterSpacing: -0.8, fontFamily: fonts.display },
  displayXl:   { fontSize: 34, lineHeight: 40, fontWeight: '300' as const, letterSpacing: -0.4, fontFamily: fonts.display },
  displayLg:   { fontSize: 28, lineHeight: 34, fontWeight: '300' as const, letterSpacing: -0.3, fontFamily: fonts.display },
  displayMd:   { fontSize: 24, lineHeight: 30, fontWeight: '300' as const, fontFamily: fonts.display },
  displaySm:   { fontSize: 20, lineHeight: 28, fontWeight: '400' as const, fontFamily: fonts.display },
  displayXs:   { fontSize: 18, lineHeight: 24, fontWeight: '500' as const, fontFamily: fonts.medium },
  // Body scale — Inter, 16/14 ladder, +0.16px tracking (editorial dialect, line-height 1.5)
  bodyLg:        { fontSize: 18, lineHeight: 27, fontWeight: '400' as const, letterSpacing: 0.16, fontFamily: fonts.regular },
  bodyMd:        { fontSize: 16, lineHeight: 24, fontWeight: '400' as const, letterSpacing: 0.16, fontFamily: fonts.regular },
  bodyMdStrong:  { fontSize: 16, lineHeight: 24, fontWeight: '500' as const, letterSpacing: 0.16, fontFamily: fonts.medium },
  bodySm:        { fontSize: 15, lineHeight: 22, fontWeight: '400' as const, letterSpacing: 0.15, fontFamily: fonts.regular },
  bodySmStrong:  { fontSize: 15, lineHeight: 22, fontWeight: '500' as const, letterSpacing: 0.15, fontFamily: fonts.medium },
  // Label / metadata scale
  caption:          { fontSize: 14, lineHeight: 21, fontWeight: '400' as const, fontFamily: fonts.regular },
  captionStrong:    { fontSize: 14, lineHeight: 21, fontWeight: '600' as const, fontFamily: fonts.semibold },
  captionUppercase: { fontSize: 12, lineHeight: 17, fontWeight: '600' as const, letterSpacing: 0.96, textTransform: 'uppercase' as const, fontFamily: fonts.semibold },
  eyebrowUppercase: { fontSize: 12, lineHeight: 17, fontWeight: '600' as const, letterSpacing: 0.96, textTransform: 'uppercase' as const, fontFamily: fonts.semibold },
  // Interactive — CTA pill text (Inter 500)
  buttonMd: { fontSize: 15, lineHeight: 20, fontWeight: '500' as const, fontFamily: fonts.medium },
} as const;

// Spacing ladder (4px base). Existing token VALUES are preserved so the ~200 consuming
// files keep their current layout; ElevenLabs' breathable rhythm is added via the new
// `xxl` (48) and `section` (96) tokens for band/section spacing.
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

// Radius ladder (DESIGN.md): CTAs + badges = pill (9999); cards = xl (16); inputs = md (8).
// pillMd/pillLg kept as names for back-compat but now resolve to the true pill (9999),
// since the ElevenLabs brand button IS a pill (reversing the prior 12px-cap rule).
export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  card: 16,
  xl: 16,
  xxl: 24,
  pillMd: 9999,
  pillLg: 9999,
  pill: 9999,
  full: 9999,
} as const;

// Elevation — "hairline + single soft drop" tier (DESIGN.md: 0 4px 16px rgba(0,0,0,0.04)).
export const elevation = {
  subtle: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  micro: {
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
} as const;

// State & interaction tokens — pressed feedback, focus rings, disabled treatment.
export const state = {
  pressedOpacity: 0.92,
  pressedScale: 0.98,
  disabledOpacity: 0.4,
  focusRingWidth: 2,
  focusRingOffset: 2,
} as const;

export const motion = {
  fast: 120,     // hover, press
  base: 200,     // panels, accordions
  entrance: 240, // modals, sheets
} as const;

export const tokens = { colors, typography, spacing, radius, elevation, state, motion, fonts } as const;
export default tokens;
