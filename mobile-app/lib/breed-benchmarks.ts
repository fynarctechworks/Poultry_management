// Breed benchmarks now live in @poultryos/shared so the web dashboard and the
// (future) server-side digest read the same canonical source. This re-export
// keeps existing local import paths working.
export {
  BREED_BENCHMARKS,
  findBenchmark,
  fcrAgainstBenchmark,
  mortalityAgainstBenchmark,
} from '@poultryos/shared';
export type { BreedBenchmark, BenchmarkTone } from '@poultryos/shared';
