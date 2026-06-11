'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

interface Props {
  /** Supabase table name to delete the row from. */
  table: string;
  /** Primary-key value of the row. */
  id: string;
  /** Where to navigate after a successful delete. Omit to just refresh in place. */
  redirectTo?: string;
  /** Button label before confirmation. Defaults to "Delete". */
  label?: string;
  /** Extra context shown in the confirm prompt, e.g. the row's name. */
  confirmText?: string;
  /** Render as a small inline link instead of an outlined button. */
  variant?: 'button' | 'link';
}

export function DeleteButton({ table, id, redirectTo, label = 'Delete', confirmText, variant = 'button' }: Props) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doDelete() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.from(table).delete().eq('id', id);
    setLoading(false);
    if (error) {
      setError(error.message);
      setConfirming(false);
      return;
    }
    if (redirectTo) router.push(redirectTo);
    router.refresh();
  }

  const linkBase = 'text-xs font-semibold';
  const btnBase = variant === 'link' ? linkBase : 'btn-outline';

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-sm">
        <button
          onClick={doDelete}
          disabled={loading}
          className={variant === 'link' ? `${linkBase} text-danger` : 'btn-outline border-danger text-danger'}
        >
          {loading ? 'Deleting…' : `Confirm delete${confirmText ? ` ${confirmText}` : ''}`}
        </button>
        <button onClick={() => setConfirming(false)} disabled={loading} className={`${linkBase} text-body`}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-sm">
      <button onClick={() => setConfirming(true)} className={variant === 'link' ? `${linkBase} text-danger` : btnBase}>
        {label}
      </button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </span>
  );
}
