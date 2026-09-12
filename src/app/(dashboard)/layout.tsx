import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { AuthSession } from "@/lib/auth";
import { prismaForTenant } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { SessionWarningWrapper } from "@/components/auth/session-warning-wrapper";
import { QueryProvider } from "@/providers/query-provider";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { UnauthorizedToast } from "./unauthorized-toast";

function PageLoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

/**
 * Dashboard layout with two-layer authentication protection
 *
 * Layer 1 (proxy.ts): Optimistic cookie check, redirects to /login if no cookie
 * Layer 2 (this layout): Authoritative session validation, redirects if invalid session
 *
 * Session validation occurs BEFORE children render → zero content flash (Decision D12)
 * This is the TRUE security boundary - proxy.ts is just UX optimization
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Layer 2: Authoritative session validation
  // This is the TRUE security boundary
  // Call auth.api.getSession() to validate session
  const rawSession = await auth.api.getSession({
    headers: await headers(),
  });

  // If no valid session → redirect to /login
  // This happens BEFORE any children render (zero content flash, Decision D12)
  if (!rawSession) {
    redirect("/login");
  }

  // Cast at boundary — user.tenantId and user.roles are set by Better Auth
  // additionalFields config and are always present for onboarded users
  const session = rawSession as unknown as AuthSession;
  const user = session.user;
  const userName = user.name || "User";
  const userEmail = user.email || "";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const userRoles = user.roles;
  const userTenantId = user.tenantId;

  // Steer an un-onboarded tenant's settings admin into the wizard — it is
  // reachable from no nav link otherwise. Only admin:manage_settings holders
  // (CAE, SYSTEM_ADMIN) can complete onboarding, so gate the redirect on that;
  // other roles fall through to the normal dashboard. The onboarding page
  // guards the reverse (completed → /dashboard), so the two agree and cannot
  // loop, and /onboarding lives outside this layout's route group.
  if (userTenantId && hasPermission(userRoles, "admin:manage_settings")) {
    const tenant = await prismaForTenant(userTenantId).tenant.findUnique({
      where: { id: userTenantId },
      select: { onboardingCompleted: true },
    });
    if (tenant && !tenant.onboardingCompleted) {
      redirect("/onboarding");
    }
  }

  // If user has no tenant or no roles, show setup required message
  // instead of rendering broken dashboard with empty sidebar (BUG-001/002)
  const needsSetup = !userTenantId || userRoles.length === 0;

  // Valid session → render children wrapped in layout
  // Pass session data to AppSidebar for role-based navigation filtering
  return (
    <QueryProvider>
      <SidebarProvider>
        {/* Skip-to-content link - visible on keyboard focus */}
        <a
          href="#main-content"
          className="focus:bg-background focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2"
        >
          Skip to main content
        </a>

        {/* App Sidebar with role-based navigation filtering */}
        <AppSidebar
          roles={userRoles}
          userName={userName}
          userEmail={userEmail}
          userInitials={userInitials}
        />

        <SidebarInset>
          {/* Top Bar */}
          <TopBar />

          {/* Session timeout warning (client component) */}
          <SessionWarningWrapper />

          {/* Unauthorized access notification */}
          <UnauthorizedToast />

          <main
            id="main-content"
            className="min-w-0 flex-1 overflow-auto p-4 md:p-6"
          >
            {needsSetup ? (
              <div className="flex min-h-[400px] items-center justify-center">
                <div className="max-w-md space-y-4 rounded-lg border border-dashed p-8 text-center">
                  <h2 className="text-lg font-semibold">
                    Account Setup Required
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    {!userTenantId
                      ? "Your account has not been assigned to a bank yet. Please contact your administrator to complete setup."
                      : "Your account has no roles assigned. Please contact your administrator to assign the appropriate role."}
                  </p>
                </div>
              </div>
            ) : (
              <Suspense fallback={<PageLoadingSkeleton />}>{children}</Suspense>
            )}
          </main>
        </SidebarInset>
      </SidebarProvider>
    </QueryProvider>
  );
}
