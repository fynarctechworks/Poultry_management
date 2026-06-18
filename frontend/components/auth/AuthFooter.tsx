import Link from 'next/link';

/**
 * Centered footer row beneath an auth form, e.g. "New here? Create account".
 * `prompt` is muted; the `<Link>` to `href` carries ink weight and an
 * underline on hover — no saturated color, per ElevenLabs guidelines.
 */
export function AuthFooter({
  prompt,
  linkLabel,
  href,
}: {
  prompt: string;
  linkLabel: string;
  href: string;
}) {
  return (
    <p className="mt-xl text-center text-sm text-body">
      {prompt}{' '}
      <Link href={href} className="font-semibold text-ink underline-offset-2 hover:underline">
        {linkLabel}
      </Link>
    </p>
  );
}
