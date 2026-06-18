import Link from 'next/link';
import { FarmForm } from './FarmForm';

export default function NewFarmPage() {
  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/farms" className="text-sm text-primary-dark font-semibold">&larr; Farms</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Add farm</h1>
      <FarmForm />
    </div>
  );
}
