import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditShedForm } from './EditShedForm';
import { DeleteButton } from '@/components/DeleteButton';

export default async function EditShedPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: shed } = await supabase
    .from('sheds')
    .select('id, farm_id, shed_name, capacity, poultry_type, status')
    .eq('id', params.id)
    .maybeSingle();

  if (!shed) notFound();

  return (
    <div className="max-w-[560px] mx-auto">
      <Link href={`/farms/${shed.farm_id}`} className="text-sm text-primary-dark font-semibold">&larr; Farm</Link>
      <h1 className="text-3xl font-bold text-ink mt-md mb-2xl">Edit shed</h1>
      <EditShedForm shed={shed as any} />
      <div className="card mt-lg">
        <p className="text-sm font-semibold text-ink mb-xs">Danger zone</p>
        <p className="text-xs text-body-soft mb-md">
          Deleting this shed also erases every batch in it and all their logs, vaccinations and health records.
        </p>
        <DeleteButton
          table="sheds"
          id={shed.id}
          redirectTo={`/farms/${shed.farm_id}`}
          label="Delete shed"
          confirmText="shed & all its batches"
        />
      </div>
    </div>
  );
}
