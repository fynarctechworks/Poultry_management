// React hook that wraps `is_paid()` RPC. Kept out of freemium.ts so the pure
// helpers there stay testable without instantiating the Supabase client.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';

export function useIsPaid() {
  const [isPaid, setIsPaid] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('is_paid');
    if (error) {
      // Default to false on error — safer to over-gate than under-gate.
      console.warn('is_paid() RPC failed, defaulting to false:', error.message);
      setIsPaid(false);
    } else {
      setIsPaid(!!data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { isPaid, loading, refetch };
}
