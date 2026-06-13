/** Title + subtitle block at the top of an auth form. */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-xl">
      <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-xs text-sm text-body">{subtitle}</p>}
    </div>
  );
}
