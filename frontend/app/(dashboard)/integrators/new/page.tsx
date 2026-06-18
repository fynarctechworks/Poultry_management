import Link from 'next/link';
import { IntegratorForm } from './IntegratorForm';

export default function NewIntegratorPage() {
  return (
    <div className="max-w-[720px] mx-auto">
      <Link href="/integrators" className="text-sm text-primary-dark font-semibold">&larr; Integrators</Link>
      <h1 className="font-display text-3xl text-ink mt-md mb-2xl">Add custom integrator</h1>
      <IntegratorForm />
    </div>
  );
}
