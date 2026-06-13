/** Inline server/validation error line. Renders nothing when `message` is empty. */
export function AuthError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="mt-md text-sm text-danger">{message}</p>;
}
