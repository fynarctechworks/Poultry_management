import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { EditBuyerForm } from './EditBuyerForm';

export default async function EditBuyerPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient();

  const { data: buyer } = await supabase
    .from('buyers')
    .select('id, buyer_name, phone, whatsapp_phone, address, gstin, credit_limit')
    .eq('id', params.id)
    .maybeSingle();

  if (!buyer) notFound();

  return (
    <div className="max-w-[680px] mx-auto">
      <Link href={`/khata/${buyer.id}`} className="text-sm text-primary-dark font-semibold">&larr; {buyer.buyer_name}</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Edit buyer</h1>
      <EditBuyerForm buyer={buyer as any} />
    </div>
  );
}
