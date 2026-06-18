'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function MarkDoneButton({ id }: { id: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);

  async function markDone() {
    setLoading(true);
    // Record who administered the dose (audit + traceability), not just the date.
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('vaccinations')
      .update({
        status: 'done',
        administered_date: new Date().toISOString().slice(0, 10),
        administered_by: user?.id ?? null,
      })
      .eq('id', id);
    setLoading(false);
    if (error) {
      alert(error.message);
      return;
    }
    router.refresh();
  }

  return (
    <button onClick={markDone} disabled={loading} className="text-xs font-semibold text-primary-dark hover:underline">
      {loading ? '…' : 'Mark done'}
    </button>
  );
}
