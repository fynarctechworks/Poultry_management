export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-lg bg-canvas-soft">
      <div className="w-full max-w-[420px]">{children}</div>
    </main>
  );
}
