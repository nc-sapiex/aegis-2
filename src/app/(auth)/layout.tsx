export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-blue-50/40 to-teal-50/30">
      {/* Subtle decorative circles */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-blue-100/40 blur-3xl" />
      <div className="pointer-events-none absolute -right-40 -bottom-40 h-[500px] w-[500px] rounded-full bg-teal-100/30 blur-3xl" />
      <div className="relative z-10 w-full max-w-md px-4">{children}</div>
    </div>
  );
}
