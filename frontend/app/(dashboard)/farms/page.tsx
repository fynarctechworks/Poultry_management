import { createSupabaseServerClient } from '@/lib/supabase/server';
import { formatDateDDMonYYYY } from '@/lib/utils';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/PageHeader';

export default async function FarmsPage() {
  const supabase = createSupabaseServerClient();
  const { data: farms } = await supabase
    .from('farms')
    .select('id, farm_name, state, district, farm_type, created_at')
    .order('created_at', { ascending: false });

  return (
    <div className="max-w-[1200px] mx-auto">
      <PageHeader
        eyebrow="Overview"
        title="Farms"
        subtitle="Every farm you own or manage."
        actions={<Link href="/farms/new" className="btn-primary">Add farm</Link>}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
        {(farms ?? []).map((f) => (
          <Link key={f.id} href={`/farms/${f.id}`} className="card hover:shadow-subtle transition-shadow">
            <h2 className="text-lg font-bold text-ink">{f.farm_name}</h2>
            <p className="text-sm text-body mt-xxs">{[f.district, f.state].filter(Boolean).join(', ') || '—'}</p>
            <div className="flex items-center justify-between mt-md">
              <span className="text-xs uppercase tracking-wider text-body-soft">{f.farm_type}</span>
              <span className="text-xs text-body-soft">{formatDateDDMonYYYY(f.created_at)}</span>
            </div>
          </Link>
        ))}
        {(!farms || farms.length === 0) && (
          <div className="card col-span-full text-center py-2xl">
            <p className="text-body">No farms yet. Use the mobile app to create your first farm.</p>
          </div>
        )}
      </div>
    </div>
  );
}
