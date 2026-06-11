import {
  FREE_LIMITS,
  canAddBuyer,
  canAddShed,
  canAddWorker,
  canAddFarm,
  hasContractAccess,
  hasTraceability,
  hasMultiFarmDashboard,
  hasVetAccess,
} from '../../PoultryOS/lib/freemium';

describe('FREE_LIMITS constants', () => {
  it('matches CLAUDE.md freemium table', () => {
    expect(FREE_LIMITS).toEqual({
      farms: 1,
      sheds: 3,
      workers: 2,
      buyers: 10,
      whatsappPerMonth: 5,
    });
  });
});

describe('canAddBuyer', () => {
  it('allows when under the free limit', () => {
    expect(canAddBuyer(0, false).allowed).toBe(true);
    expect(canAddBuyer(9, false).allowed).toBe(true);
  });

  it('blocks at exactly the free limit', () => {
    const r = canAddBuyer(10, false);
    expect(r.allowed).toBe(false);
    expect(r.reason).toContain('10');
  });

  it('blocks above the free limit', () => {
    expect(canAddBuyer(11, false).allowed).toBe(false);
    expect(canAddBuyer(999, false).allowed).toBe(false);
  });

  it('always allows for paid users — even far above the limit', () => {
    expect(canAddBuyer(0, true).allowed).toBe(true);
    expect(canAddBuyer(10, true).allowed).toBe(true);
    expect(canAddBuyer(5_000, true).allowed).toBe(true);
  });
});

describe('canAddShed', () => {
  it('allows up to 2 sheds for free, blocks at 3', () => {
    expect(canAddShed(0, false).allowed).toBe(true);
    expect(canAddShed(2, false).allowed).toBe(true);
    expect(canAddShed(3, false).allowed).toBe(false);
    expect(canAddShed(50, false).allowed).toBe(false);
  });

  it('always allows for paid users', () => {
    expect(canAddShed(3, true).allowed).toBe(true);
    expect(canAddShed(100, true).allowed).toBe(true);
  });

  it('returns a reason mentioning the limit when blocked', () => {
    expect(canAddShed(3, false).reason).toContain('3');
  });
});

describe('canAddWorker', () => {
  it('allows up to 1 worker for free, blocks at 2', () => {
    expect(canAddWorker(0, false).allowed).toBe(true);
    expect(canAddWorker(1, false).allowed).toBe(true);
    expect(canAddWorker(2, false).allowed).toBe(false);
  });

  it('always allows for paid users', () => {
    expect(canAddWorker(10, true).allowed).toBe(true);
  });
});

describe('canAddFarm', () => {
  it('allows the first farm for free, blocks the second', () => {
    expect(canAddFarm(0, false).allowed).toBe(true);
    expect(canAddFarm(1, false).allowed).toBe(false);
  });

  it('always allows for paid users', () => {
    expect(canAddFarm(1, true).allowed).toBe(true);
    expect(canAddFarm(5, true).allowed).toBe(true);
  });
});

describe('feature-flag gates', () => {
  it.each([
    ['hasContractAccess', hasContractAccess],
    ['hasTraceability', hasTraceability],
    ['hasMultiFarmDashboard', hasMultiFarmDashboard],
    ['hasVetAccess', hasVetAccess],
  ])('%s blocks free users and allows paid users', (_name, fn) => {
    expect(fn(false).allowed).toBe(false);
    expect(fn(false).reason).toBeTruthy();
    expect(fn(true).allowed).toBe(true);
    expect(fn(true).reason).toBeUndefined();
  });
});
