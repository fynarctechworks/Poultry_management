import {
  NECC_ZONES,
  stateDefaultZone,
  isNeccZone,
  eggRatePerPiece,
  eggRatePerTray,
} from '@poultryos/shared';

describe('NECC zones', () => {
  it('exposes the key declaration centres', () => {
    expect(NECC_ZONES).toContain('Namakkal');
    expect(NECC_ZONES).toContain('Hyderabad');
    expect(NECC_ZONES.length).toBeGreaterThan(20);
  });

  it('maps states to a default zone case-insensitively', () => {
    expect(stateDefaultZone('Tamil Nadu')).toBe('Namakkal');
    expect(stateDefaultZone('telangana')).toBe('Hyderabad');
    expect(stateDefaultZone('  Andhra Pradesh ')).toBe('Vijayawada');
    expect(stateDefaultZone('Goa')).toBeNull();
    expect(stateDefaultZone(null)).toBeNull();
  });

  it('validates zone membership', () => {
    expect(isNeccZone('Namakkal')).toBe(true);
    expect(isNeccZone('Atlantis')).toBe(false);
    expect(isNeccZone(null)).toBe(false);
  });

  it('derives per-egg and per-tray rates from ₹/100', () => {
    expect(eggRatePerPiece(560)).toBeCloseTo(5.6, 5);
    expect(eggRatePerTray(560)).toBeCloseTo(168, 5); // 5.6 × 30
    expect(eggRatePerPiece(null)).toBeNull();
    expect(eggRatePerTray(undefined)).toBeNull();
  });
});
