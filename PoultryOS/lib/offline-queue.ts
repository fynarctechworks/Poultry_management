/**
 * offline-queue.ts
 *
 * AsyncStorage-backed queue for operations that must survive connectivity loss.
 * Currently used only for daily_logs inserts; designed to be generic (table-keyed).
 *
 * Storage key: @offline_queue_v1  (JSON-stringified QueuedOperation[])
 * Flush semantics:
 *   - Iterates queue in insertion order.
 *   - On success: removes item immediately.
 *   - On error: increments attempts; stops retrying after MAX_ATTEMPTS (5).
 *   - Returns { flushed, failed } counts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient } from '@supabase/supabase-js';

export const QUEUE_KEY = '@offline_queue_v1';
const MAX_ATTEMPTS = 5;

export interface QueuedOperation {
  id: string;           // uuid for idempotency
  table: string;        // 'daily_logs' for now
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: string;    // ISO timestamp
  lastError?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function readQueue(): Promise<QueuedOperation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedOperation[];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedOperation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

function generateId(): string {
  // RFC4122-ish uuid without external deps
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Add an operation to the persistent queue. Returns the created entry. */
export async function enqueue(
  op: Omit<QueuedOperation, 'id' | 'attempts' | 'createdAt'>,
): Promise<QueuedOperation> {
  const entry: QueuedOperation = {
    ...op,
    id: generateId(),
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  const queue = await readQueue();
  queue.push(entry);
  await writeQueue(queue);
  return entry;
}

/** Read all pending operations (including those at max attempts). */
export async function getAll(): Promise<QueuedOperation[]> {
  return readQueue();
}

/** Remove a single operation by id. */
export async function remove(id: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((op) => op.id !== id));
}

/** Clear the entire queue (use with caution — data loss if items not yet synced). */
export async function clear(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

/**
 * Attempt to flush pending operations to Supabase.
 *
 * Uses upsert on `daily_logs` to respect the UNIQUE(batch_id, log_date) constraint
 * (last-write-wins, which is correct for our use case).
 *
 * Returns { flushed, failed } counts.
 */
export async function flush(
  supabase: SupabaseClient,
): Promise<{ flushed: number; failed: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { flushed: 0, failed: 0 };

  let flushed = 0;
  let failed = 0;

  // Work on a mutable copy; persist after processing
  const remaining: QueuedOperation[] = [];

  for (const op of queue) {
    if (op.attempts >= MAX_ATTEMPTS) {
      // Give up — keep in queue so user can see it, but count as failed
      remaining.push(op);
      failed++;
      continue;
    }

    try {
      // daily_logs uses upsert to handle UNIQUE(batch_id, log_date) gracefully
      const { error } = await (supabase as SupabaseClient)
        .from(op.table)
        .upsert(op.payload, { onConflict: 'batch_id,log_date' });

      if (error) {
        remaining.push({
          ...op,
          attempts: op.attempts + 1,
          lastError: error.message,
        });
        failed++;
      } else {
        flushed++;
        // Don't push to remaining — item is consumed
      }
    } catch (e: unknown) {
      remaining.push({
        ...op,
        attempts: op.attempts + 1,
        lastError: e instanceof Error ? e.message : 'Unknown error',
      });
      failed++;
    }
  }

  await writeQueue(remaining);
  return { flushed, failed };
}
