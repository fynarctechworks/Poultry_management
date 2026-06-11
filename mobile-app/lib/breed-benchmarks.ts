// Breed standard benchmarks for FCR, mortality, weight, and cycle days.
// Source: published breeder management guides (Cobb-Vantress, Ross-Aviagen,
// Hyline, Lohmann) for commercial broilers and layers in India.
//
// Numbers are conservative targets that a well-managed farm in Indian
// conditions should hit. Use them as "is this batch on track?" indicators,
// not strict KPIs — actual performance varies with feed quality, climate,
// and housing.
//
// Pure data + lookup. No React, no I/O. Easy to unit-test.

export interface BreedBenchmark {
  /** Display name matched case-insensitively against batches.breed_name */
  breed: string;
  /** 'broiler' | 'layer' | 'breeder' */
  poultryType: 'broiler' | 'layer' | 'breeder';
  /** Target cumulative FCR at end of cycle */
  targetFcr: number;
  /** Acceptable mortality % over the full cycle */
  targetMortalityPct: number;
  /** Target avg weight at end of cycle (kg) — null for layers */
  targetWeightKg: number | null;
  /** Standard cycle length (days) */
  cycleDays: number;
}

export const BREED_BENCHMARKS: BreedBenchmark[] = [
  // Broilers (most common in India)
  {
    breed: 'Cobb 500',
    poultryType: 'broiler',
    targetFcr: 1.6,
    targetMortalityPct: 3.0,
    targetWeightKg: 2.1,
    cycleDays: 42,
  },
  {
    breed: 'Cobb 700',
    poultryType: 'broiler',
    targetFcr: 1.7,
    targetMortalityPct: 3.5,
    targetWeightKg: 2.4,
    cycleDays: 45,
  },
  {
    breed: 'Ross 308',
    poultryType: 'broiler',
    targetFcr: 1.55,
    targetMortalityPct: 3.0,
    targetWeightKg: 2.2,
    cycleDays: 42,
  },
  {
    breed: 'Ross 708',
    poultryType: 'broiler',
    targetFcr: 1.65,
    targetMortalityPct: 3.5,
    targetWeightKg: 2.5,
    cycleDays: 45,
  },
  {
    breed: 'Vencobb',
    poultryType: 'broiler',
    targetFcr: 1.7,
    targetMortalityPct: 4.0,
    targetWeightKg: 2.0,
    cycleDays: 42,
  },
  {
    breed: 'Hubbard',
    poultryType: 'broiler',
    targetFcr: 1.65,
    targetMortalityPct: 3.5,
    targetWeightKg: 2.1,
    cycleDays: 42,
  },

  // Layers
  {
    breed: 'BV 300',
    poultryType: 'layer',
    targetFcr: 2.1,
    targetMortalityPct: 5.0,
    targetWeightKg: null,
    cycleDays: 504, // ~72 weeks lay cycle
  },
  {
    breed: 'Hyline Brown',
    poultryType: 'layer',
    targetFcr: 2.05,
    targetMortalityPct: 5.0,
    targetWeightKg: null,
    cycleDays: 504,
  },
  {
    breed: 'Hyline W36',
    poultryType: 'layer',
    targetFcr: 1.85,
    targetMortalityPct: 5.5,
    targetWeightKg: null,
    cycleDays: 504,
  },
  {
    breed: 'Lohmann LSL',
    poultryType: 'layer',
    targetFcr: 1.95,
    targetMortalityPct: 5.0,
    targetWeightKg: null,
    cycleDays: 504,
  },
  {
    breed: 'Lohmann Brown',
    poultryType: 'layer',
    targetFcr: 2.05,
    targetMortalityPct: 5.0,
    targetWeightKg: null,
    cycleDays: 504,
  },

  // Breeders
  {
    breed: 'Cobb 500 SF',
    poultryType: 'breeder',
    targetFcr: 2.3,
    targetMortalityPct: 4.5,
    targetWeightKg: 3.4,
    cycleDays: 180,
  },
];

/**
 * Find the closest matching benchmark by breed name.
 *
 * Match priority:
 *   1. Exact case-insensitive match on full breed string
 *   2. Substring match where the benchmark name is contained in the input
 *      (e.g. batch breed "Cobb 500 SF" matches benchmark "Cobb 500")
 *   3. Substring match where the input is contained in the benchmark name
 *      (e.g. batch breed "Cobb" matches benchmark "Cobb 500")
 *   4. null if no plausible match
 *
 * Layers/broilers are filtered when poultryType is supplied so a layer
 * batch doesn't accidentally match a broiler benchmark with the same name.
 */
export function findBenchmark(
  breedName: string | null | undefined,
  poultryType?: 'broiler' | 'layer' | 'breeder',
): BreedBenchmark | null {
  if (!breedName) return null;
  const needle = breedName.trim().toLowerCase();
  if (!needle) return null;

  const pool = poultryType
    ? BREED_BENCHMARKS.filter((b) => b.poultryType === poultryType)
    : BREED_BENCHMARKS;

  // 1. Exact match
  const exact = pool.find((b) => b.breed.toLowerCase() === needle);
  if (exact) return exact;

  // 2. Benchmark name ⊂ input
  const benchmarkInInput = pool.find((b) =>
    needle.includes(b.breed.toLowerCase()),
  );
  if (benchmarkInInput) return benchmarkInInput;

  // 3. Input ⊂ benchmark name
  const inputInBenchmark = pool.find((b) =>
    b.breed.toLowerCase().includes(needle),
  );
  if (inputInBenchmark) return inputInBenchmark;

  return null;
}

export type BenchmarkTone = 'success' | 'warning' | 'danger' | 'neutral';

/**
 * Classifies an actual FCR against the benchmark target.
 * Lower FCR = better feed efficiency.
 *
 *   actual ≤ target          → success (on or beating target)
 *   actual ≤ target × 1.10   → warning (within 10% of target)
 *   actual >  target × 1.10  → danger (significantly above target)
 */
export function fcrAgainstBenchmark(
  actual: number | null | undefined,
  target: number,
): BenchmarkTone {
  if (actual === null || actual === undefined || Number.isNaN(Number(actual))) {
    return 'neutral';
  }
  const a = Number(actual);
  if (a <= target) return 'success';
  if (a <= target * 1.1) return 'warning';
  return 'danger';
}

/**
 * Classifies actual mortality % against the target.
 * Lower mortality = better.
 *
 *   actual ≤ target          → success
 *   actual ≤ target × 1.50   → warning (up to 50% above target)
 *   actual >  target × 1.50  → danger
 */
export function mortalityAgainstBenchmark(
  actual: number | null | undefined,
  target: number,
): BenchmarkTone {
  if (actual === null || actual === undefined || Number.isNaN(Number(actual))) {
    return 'neutral';
  }
  const a = Number(actual);
  if (a <= target) return 'success';
  if (a <= target * 1.5) return 'warning';
  return 'danger';
}
