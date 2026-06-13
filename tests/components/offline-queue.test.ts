/**
 * offline-queue.test.ts
 *
 * Unit tests for lib/offline-queue.ts — the AsyncStorage-backed queue that
 * holds daily_logs inserts while the device is offline.
 *
 * AsyncStorage is mocked with an in-memory implementation. The Supabase client
 * passed to flush() is a hand-rolled stub so we control success/error outcomes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  enqueue,
  getAll,
  remove,
  clear,
  flush,
  QUEUE_KEY,
  type QueuedOperation,
} from '../../mobile-app/lib/offline-queue';

// In-memory AsyncStorage mock
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((k: string) => Promise.resolve(store[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => {
      store[k] = v;
      return Promise.resolve();
    }),
    removeItem: jest.fn((k: string) => {
      delete store[k];
      return Promise.resolve();
    }),
    __reset: () => {
      store = {};
    },
  };
});

const samplePayload = {
  batch_id: 'b-1',
  farm_id: 'f-1',
  log_date: '2026-05-19',
  birds_dead: 2,
};

beforeEach(async () => {
  // @ts-expect-error — __reset is a test-only escape hatch on the mock
  AsyncStorage.__reset();
});

describe('enqueue', () => {
  it('adds an operation with a generated id, zero attempts and a timestamp', async () => {
    const entry = await enqueue({ table: 'daily_logs', payload: samplePayload });
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.attempts).toBe(0);
    expect(entry.createdAt).toBeTruthy();
    expect(entry.table).toBe('daily_logs');
  });

  it('appends to the queue in insertion order', async () => {
    await enqueue({ table: 'daily_logs', payload: { ...samplePayload, log_date: '2026-05-18' } });
    await enqueue({ table: 'daily_logs', payload: { ...samplePayload, log_date: '2026-05-19' } });
    const all = await getAll();
    expect(all).toHaveLength(2);
    expect(all[0].payload.log_date).toBe('2026-05-18');
    expect(all[1].payload.log_date).toBe('2026-05-19');
  });

  it('persists to the QUEUE_KEY storage slot', async () => {
    await enqueue({ table: 'daily_logs', payload: samplePayload });
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });
});

describe('getAll', () => {
  it('returns an empty array when nothing is queued', async () => {
    expect(await getAll()).toEqual([]);
  });
});

describe('remove', () => {
  it('removes a single operation by id and leaves the rest', async () => {
    const a = await enqueue({ table: 'daily_logs', payload: samplePayload });
    await enqueue({ table: 'daily_logs', payload: { ...samplePayload, log_date: '2026-05-20' } });
    await remove(a.id);
    const all = await getAll();
    expect(all).toHaveLength(1);
    expect(all[0].payload.log_date).toBe('2026-05-20');
  });
});

describe('clear', () => {
  it('empties the entire queue', async () => {
    await enqueue({ table: 'daily_logs', payload: samplePayload });
    await clear();
    expect(await getAll()).toEqual([]);
  });
});

describe('flush', () => {
  it('returns zero counts on an empty queue without touching Supabase', async () => {
    const supabase = { from: jest.fn() };
    const result = await flush(supabase as never);
    expect(result).toEqual({ flushed: 0, failed: 0 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('flushes all items on success and clears the queue', async () => {
    await enqueue({ table: 'daily_logs', payload: samplePayload });
    await enqueue({ table: 'daily_logs', payload: { ...samplePayload, log_date: '2026-05-20' } });

    const upsert = jest.fn().mockResolvedValue({ error: null });
    const supabase = { from: jest.fn(() => ({ upsert })) };

    const result = await flush(supabase as never);
    expect(result).toEqual({ flushed: 2, failed: 0 });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(await getAll()).toEqual([]);
  });

  it('keeps failed items in the queue and increments their attempts', async () => {
    await enqueue({ table: 'daily_logs', payload: samplePayload });

    const upsert = jest.fn().mockResolvedValue({ error: { message: 'network down' } });
    const supabase = { from: jest.fn(() => ({ upsert })) };

    const result = await flush(supabase as never);
    expect(result).toEqual({ flushed: 0, failed: 1 });

    const all = await getAll();
    expect(all).toHaveLength(1);
    expect(all[0].attempts).toBe(1);
    expect(all[0].lastError).toBe('network down');
  });

  it('stops retrying an item once it reaches MAX_ATTEMPTS (5)', async () => {
    // Seed the queue directly with an item already at the attempt ceiling
    const maxedOut: QueuedOperation = {
      id: 'maxed-1',
      table: 'daily_logs',
      payload: samplePayload,
      attempts: 5,
      createdAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([maxedOut]));

    const upsert = jest.fn().mockResolvedValue({ error: null });
    const supabase = { from: jest.fn(() => ({ upsert })) };

    const result = await flush(supabase as never);
    expect(result).toEqual({ flushed: 0, failed: 1 });
    // Supabase must NOT be called for an item past the attempt ceiling
    expect(upsert).not.toHaveBeenCalled();
    // Item stays in the queue so the user can still see it
    expect(await getAll()).toHaveLength(1);
  });

  it('upserts on the conflict target so duplicate log dates are last-write-wins', async () => {
    await enqueue({ table: 'daily_logs', payload: samplePayload });
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const supabase = { from: jest.fn(() => ({ upsert })) };

    await flush(supabase as never);
    expect(supabase.from).toHaveBeenCalledWith('daily_logs');
    expect(upsert).toHaveBeenCalledWith(samplePayload, { onConflict: 'batch_id,log_date' });
  });
});
