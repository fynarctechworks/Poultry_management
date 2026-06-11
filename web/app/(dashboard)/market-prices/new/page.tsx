import Link from 'next/link';
import { PriceEntryForm } from './PriceEntryForm';

export default function NewMarketPricePage() {
  return (
    <div className="max-w-[560px] mx-auto">
      <Link href="/market-prices" className="text-sm text-primary-dark font-semibold">&larr; Market Prices</Link>
      <h1 className="text-3xl font-bold text-ink mt-md mb-xs">Manual price entry</h1>
      <p className="text-sm text-body mb-2xl">Use this when the Agmarknet feed is unavailable or you want to record a local mandi rate.</p>
      <PriceEntryForm />
    </div>
  );
}
