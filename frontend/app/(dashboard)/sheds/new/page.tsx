import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { ShedForm } from './ShedForm';

export default async function NewShedPage() {
  const supabase = createSupabaseServerClient();
  const { data: farms } = await supabase.from('farms').select('id, farm_name').order('farm_name');
  return (
    <div className="max-w-[640px] mx-auto">
      <Link href="/farms" className="text-sm text-primary-dark font-semibold">&larr; Farms</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Add shed</h1>
      <ShedForm farms={farms ?? []} />
    </div>
  );
}
