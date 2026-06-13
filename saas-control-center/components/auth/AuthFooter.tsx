import Link from 'next/link';

/**
 * Centered footer row beneath an auth form, e.g. "New here? Create account".
 * `prompt` is muted; the `<Link>` to `href` is the brand-coloured action.
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
      <Link href={href} className="font-semibold text-primary-dark hover:underline">
        {linkLabel}
      </Link>
    </p>
  );
}
