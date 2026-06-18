/**
 * Title + subtitle block at the top of an auth form.
 * h1 runs EB Garamond Light (font-display, weight 300) — editorial serif per DESIGN.md.
 * Never bold on display type.
 */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-xl">
      <h1 className="font-display text-[2rem] leading-[1.15] tracking-[-0.32px] text-ink">{title}</h1>
      {subtitle && <p className="mt-sm text-sm text-muted leading-relaxed">{subtitle}</p>}
    </div>
  );
}
