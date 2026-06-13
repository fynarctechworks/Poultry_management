import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual style — solid brand (default) or subtle tertiary. */
  variant?: 'primary' | 'subtle';
  /** When true, shows `loadingLabel` and disables the button. */
  loading?: boolean;
  loadingLabel?: string;
};

/**
 * Full-width auth action button. Wraps the `.btn-primary` / `.btn-subtle` token
 * utilities (44px min target, 12px radius per DESIGN.md). Pass `loading` to swap
 * the label and disable while a request is in flight.
 */
export function AuthButton({
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled,
  children,
  className = '',
  type = 'submit',
  ...props
}: Props) {
  const base = variant === 'subtle' ? 'btn-subtle' : 'btn-primary';
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`${base} w-full ${className}`}
      {...props}
    >
      {loading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
