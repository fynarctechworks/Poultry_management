/** Horizontal rule with centered label, e.g. "or continue with". */
export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-lg flex items-center gap-md">
      <span className="h-px flex-1 bg-mute" />
      <span className="text-xs font-medium text-body-soft">{label}</span>
      <span className="h-px flex-1 bg-mute" />
    </div>
  );
}
