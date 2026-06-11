'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

export function VetNoteForm({ incidentId, initialNote }: { incidentId: string; initialNote: string }) {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [note, setNote] = useState(initialNote);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    const { error } = await supabase
      .from('health_incidents')
      .update({ vet_note: note })
      .eq('id', incidentId);
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <div className="card space-y-md">
      <textarea
        className="input min-h-[120px] resize-y"
        placeholder="Add clinical notes, follow-up advice, or treatment guidance…"
        value={note}
        onChange={(e) => { setNote(e.target.value); setSaved(false); }}
      />
      <div className="flex items-center gap-md">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving…' : 'Save note'}</button>
        {saved && <span className="text-sm text-success-ink font-semibold">Saved.</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}
