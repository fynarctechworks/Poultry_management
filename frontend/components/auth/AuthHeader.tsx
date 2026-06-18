/**
 * Title + subtitle block at the top of an auth form.
 *
 * The title runs EB Garamond Light 300 (`font-display`) — the editorial
 * signature of the ElevenLabs design system. Never bold: the display weight
 * carries the hierarchy on its own.
 */
export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-xl">
      <h1 className="font-display text-4xl leading-tight tracking-tight text-ink">{title}</h1>
      {subtitle && <p className="mt-sm text-sm text-body">{subtitle}</p>}
    </div>
  );
}
