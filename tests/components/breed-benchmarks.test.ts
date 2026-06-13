import {
  BREED_BENCHMARKS,
  findBenchmark,
  fcrAgainstBenchmark,
  mortalityAgainstBenchmark,
} from '../../mobile-app/lib/breed-benchmarks';

describe('BREED_BENCHMARKS', () => {
  it('includes the four big Indian broiler breeds', () => {
    const names = BREED_BENCHMARKS.map((b) => b.breed);
    expect(names).toEqual(expect.arrayContaining(['Cobb 500', 'Ross 308', 'Vencobb', 'Hubbard']));
  });

  it('every entry has a positive targetFcr and cycleDays', () => {
    for (const b of BREED_BENCHMARKS) {
      expect(b.targetFcr).toBeGreaterThan(0);
      expect(b.cycleDays).toBeGreaterThan(0);
    }
  });
});

describe('findBenchmark', () => {
  it('matches case-insensitively on the exact name', () => {
    expect(findBenchmark('Cobb 500')?.breed).toBe('Cobb 500');
    expect(findBenchmark('cobb 500')?.breed).toBe('Cobb 500');
    expect(findBenchmark('COBB 500')?.breed).toBe('Cobb 500');
  });

  it('returns null on null/empty inputs', () => {
    expect(findBenchmark(null)).toBeNull();
    expect(findBenchmark(undefined)).toBeNull();
    expect(findBenchmark('')).toBeNull();
    expect(findBenchmark('   ')).toBeNull();
  });

  it('matches when benchmark name is contained in the input', () => {
    // "Cobb 500 SF" benchmark exists for breeders, but for a broiler batch
    // labelled "Cobb 500 commercial" we should still hit Cobb 500.
    expect(findBenchmark('Cobb 500 commercial', 'broiler')?.breed).toBe('Cobb 500');
  });

  it('matches when input is contained in the benchmark name', () => {
    expect(findBenchmark('Hyline', 'layer')?.breed).toMatch(/Hyline/);
  });

  it('returns null for unknown breeds', () => {
    expect(findBenchmark('Mystery Breed', 'broiler')).toBeNull();
  });

  it('filters by poultryType when supplied', () => {
    // "Cobb 500 SF" is the breeder; "Cobb 500" is the broiler. Without a
    // filter, an exact "Cobb 500" match returns the broiler. Asking for
    // breeder should return the breeder variant.
    expect(findBenchmark('Cobb 500', 'broiler')?.poultryType).toBe('broiler');
    expect(findBenchmark('Cobb 500', 'breeder')?.poultryType).toBe('breeder');
  });
});

describe('fcrAgainstBenchmark', () => {
  it('rates actual at-or-below target as success', () => {
    expect(fcrAgainstBenchmark(1.5, 1.6)).toBe('success');
    expect(fcrAgainstBenchmark(1.6, 1.6)).toBe('success');
  });

  it('rates 10% over as warning', () => {
    expect(fcrAgainstBenchmark(1.7, 1.6)).toBe('warning');
    expect(fcrAgainstBenchmark(1.76, 1.6)).toBe('warning'); // exactly target × 1.10
  });

  it('rates more than 10% over as danger', () => {
    expect(fcrAgainstBenchmark(1.9, 1.6)).toBe('danger');
    expect(fcrAgainstBenchmark(2.5, 1.6)).toBe('danger');
  });

  it('returns neutral for null / NaN', () => {
    expect(fcrAgainstBenchmark(null, 1.6)).toBe('neutral');
    expect(fcrAgainstBenchmark(undefined, 1.6)).toBe('neutral');
    expect(fcrAgainstBenchmark(NaN, 1.6)).toBe('neutral');
  });
});

describe('mortalityAgainstBenchmark', () => {
  it('rates at-or-below target as success', () => {
    expect(mortalityAgainstBenchmark(2, 3)).toBe('success');
    expect(mortalityAgainstBenchmark(3, 3)).toBe('success');
  });

  it('rates up to 50% over as warning', () => {
    expect(mortalityAgainstBenchmark(4, 3)).toBe('warning');
    expect(mortalityAgainstBenchmark(4.5, 3)).toBe('warning');
  });

  it('rates more than 50% over as danger', () => {
    expect(mortalityAgainstBenchmark(5, 3)).toBe('danger');
    expect(mortalityAgainstBenchmark(10, 3)).toBe('danger');
  });
});
