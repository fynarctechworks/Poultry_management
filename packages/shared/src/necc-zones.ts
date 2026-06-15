// NECC zonal egg pricing reference.
//
// NECC (National Egg Coordination Committee) declares egg rates per declaration
// centre ("zone"), not per state. A farm tracks the centre nearest its market.
// This module is the static reference: the list of zones and a best-effort
// state → default-zone mapping used to pre-select a farm's zone at onboarding.
// Pure data + helpers — no I/O.

/** NECC declaration centres (zones). Stable identifiers stored in farms.necc_zone. */
export const NECC_ZONES: readonly string[] = [
  'Ahmedabad',
  'Ajmer',
  'Allahabad',
  'Barwala',
  'Bengaluru',
  'Bhopal',
  'Brahmapur',
  'Chennai',
  'Chittoor',
  'Delhi',
  'E.Godavari',
  'Hospet',
  'Hyderabad',
  'Indore',
  'Jabalpur',
  'Kanpur',
  'Kolkata',
  'Ludhiana',
  'Mumbai',
  'Mysuru',
  'Nagpur',
  'Namakkal',
  'Patna',
  'Pune',
  'Raipur',
  'Ranchi',
  'Surat',
  'Vijayawada',
  'Vizag',
  'Warangal',
  'W.Godavari',
] as const;

const STATE_DEFAULT_ZONE: Record<string, string> = {
  'tamil nadu': 'Namakkal',
  telangana: 'Hyderabad',
  'andhra pradesh': 'Vijayawada',
  karnataka: 'Bengaluru',
  maharashtra: 'Mumbai',
  haryana: 'Barwala',
  punjab: 'Ludhiana',
  delhi: 'Delhi',
  'west bengal': 'Kolkata',
  gujarat: 'Ahmedabad',
  rajasthan: 'Ajmer',
  'madhya pradesh': 'Indore',
  chhattisgarh: 'Raipur',
  'uttar pradesh': 'Kanpur',
  bihar: 'Patna',
  odisha: 'Brahmapur',
  jharkhand: 'Ranchi',
};

/** Best-effort default NECC zone for a state (case-insensitive). Null if unknown. */
export function stateDefaultZone(state: string | null | undefined): string | null {
  if (!state) return null;
  return STATE_DEFAULT_ZONE[state.trim().toLowerCase()] ?? null;
}

export function isNeccZone(zone: string | null | undefined): boolean {
  return !!zone && NECC_ZONES.includes(zone);
}

/** ₹/100 eggs → ₹/egg. */
export function eggRatePerPiece(ratePer100: number | null | undefined): number | null {
  if (ratePer100 == null || !Number.isFinite(Number(ratePer100))) return null;
  return Number(ratePer100) / 100;
}

/** ₹/100 eggs → ₹/tray of 30 (the common wholesale unit). */
export function eggRatePerTray(ratePer100: number | null | undefined): number | null {
  const per = eggRatePerPiece(ratePer100);
  return per == null ? null : per * 30;
}
