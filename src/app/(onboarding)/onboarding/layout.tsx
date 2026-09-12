import { Shield } from "@/lib/icons";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen">
      {/* Minimal header — no sidebar, no TopBar */}
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <Shield className="text-primary h-6 w-6" />
          <span className="text-lg font-semibold tracking-tight">AEGIS</span>
          <span className="text-muted-foreground text-sm">
            &middot; Onboarding
          </span>
        </div>
      </header>

      {/* Centered content area */}
      <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
    </div>
  );
}
