/**
 * useOfflineQueue.ts
 *
 * React hook that:
 *  - Tracks online/offline status via expo-network
 *  - Maintains a live count of pending queue items
 *  - Auto-flushes when connectivity is restored (offline → online)
 *  - Exposes manual flush() for use in app foreground handlers
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Network from 'expo-network';
import { supabase } from '../lib/supabase';
import {
  flush as flushQueue,
  getAll,
} from '../lib/offline-queue';

export interface UseOfflineQueueReturn {
  /** Number of operations currently queued (pending sync). */
  pendingCount: number;
  /** Whether the device currently has connectivity. */
  isOnline: boolean;
  /** Manually trigger a flush attempt. */
  flush: () => Promise<{ flushed: number; failed: number }>;
  /** ISO string of last successful flush, or null if never flushed. */
  lastSyncAt: string | null;
}

const POLL_INTERVAL_MS = 2000;

export function useOfflineQueue(): UseOfflineQueueReturn {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const wasOnlineRef = useRef(true);
  const isFlushing = useRef(false);

  // ---------------------------------------------------------------------------
  // Refresh the queue length from AsyncStorage
  // ---------------------------------------------------------------------------
  const refreshCount = useCallback(async () => {
    const queue = await getAll();
    setPendingCount(queue.length);
  }, []);

  // ---------------------------------------------------------------------------
  // Flush wrapper — prevents concurrent flushes
  // ---------------------------------------------------------------------------
  const flush = useCallback(async () => {
    if (isFlushing.current) return { flushed: 0, failed: 0 };
    isFlushing.current = true;
    try {
      const result = await flushQueue(supabase);
      if (result.flushed > 0) {
        setLastSyncAt(new Date().toISOString());
      }
      await refreshCount();
      return result;
    } finally {
      isFlushing.current = false;
    }
  }, [refreshCount]);

  // ---------------------------------------------------------------------------
  // Network state polling
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let active = true;

    const checkNetwork = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        const online =
          (state.isConnected ?? false) &&
          state.isInternetReachable !== false;

        if (!active) return;

        const wasOnline = wasOnlineRef.current;
        wasOnlineRef.current = online;
        setIsOnline(online);

        // Auto-flush on transition offline → online
        if (!wasOnline && online) {
          flush();
        }
      } catch {
        // Network check failed — assume online to avoid blocking user
        if (active) setIsOnline(true);
      }
    };

    // Run immediately
    checkNetwork();

    // Poll as backstop (expo-network doesn't have a reliable event listener on all platforms)
    const interval = setInterval(checkNetwork, POLL_INTERVAL_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [flush]);

  // ---------------------------------------------------------------------------
  // Poll queue count as backstop (catches enqueues from other call sites)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    refreshCount();
    const interval = setInterval(refreshCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshCount]);

  return { pendingCount, isOnline, flush, lastSyncAt };
}
