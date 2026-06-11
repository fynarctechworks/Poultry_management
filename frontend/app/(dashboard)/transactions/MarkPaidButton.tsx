'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function MarkPaidButton({ id }: { id: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [loading, setLoading] = useState(false);

  async function markPaid() {
    setLoading(true);
    const { error } = await supabase
      .from('financial_transactions')
      .update({ payment_status: 'paid' })
      .eq('id', id);
    setLoading(false);
    if (error) { alert(error.message); return; }
    router.refresh();
  }

  return (
    <button onClick={markPaid} disabled={loading} className="text-xs text-success-ink font-semibold">
      {loading ? '…' : 'Mark paid'}
    </button>
  );
}
