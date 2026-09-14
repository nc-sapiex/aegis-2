"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Bell, ChevronRight, LogOut, Settings } from "@/lib/icons";
import { authClient, handleSignOut } from "@/lib/auth-client";
import Link from "next/link";
import { navItems } from "@/lib/nav-items";

/** Display labels for known sub-routes in deep paths */
const SUB_ROUTE_LABELS: Record<string, string> = {
  rbia: "RBIA Assessment",
  report: "Report",
  findings: "Findings",
  cash: "Cash",
  loans: "Loans",
  sections: "Sections",
  "sma-npa": "SMA/NPA",
  "bh-certificate": "BH Certificate",
  "cash-verification": "Cash Verification",
  "loan-review": "Loan Review",
  create: "Create New",
  new: "New",
  ace: "ACE",
  acb: "ACB",
  users: "Users",
  branches: "Branches",
  zones: "Zones",
  templates: "Templates",
  "ram-config": "RAM Config",
  board: "Board",
  score: "Score",
  meetings: "Meetings",
  module: "Module",
};

/** Check if a segment looks like a dynamic ID (UUID, cuid, or numeric) */
function isDynamicSegment(segment: string): boolean {
  // UUID v4
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      segment,
    )
  )
    return true;
  // cuid or cuid2 (starts with c, 20-30 chars)
  if (/^c[a-z0-9]{19,29}$/i.test(segment)) return true;
  // Pure numeric ID
  if (/^\d+$/.test(segment)) return true;
  // Long alphanumeric hash (>16 chars)
  if (/^[a-z0-9]{16,}$/i.test(segment)) return true;
  return false;
}

export function TopBar() {
  const pathname = usePathname();

  // Get Better Auth session
  const { data: session } = authClient.useSession();

  // Derive user initials from session
  const userInitials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
    : "?";

  // Derive page name from pathname using navItems
  const currentNav = navItems.find((item) => pathname.startsWith(item.href));
  const currentPage = currentNav?.title;

  // Build multi-level breadcrumb segments from the pathname
  const breadcrumbSegments: { label: string; href?: string }[] = [];
  if (currentNav && currentPage) {
    breadcrumbSegments.push({ label: currentPage, href: currentNav.href });

    // Parse segments after the nav item's base path
    const rest = pathname.slice(currentNav.href.length).replace(/^\//, "");
    if (rest) {
      const parts = rest.split("/").filter(Boolean);
      for (const part of parts) {
        if (isDynamicSegment(part)) continue;
        const label =
          SUB_ROUTE_LABELS[part] ??
          part.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        breadcrumbSegments.push({ label });
      }
    }
  }

  return (
    <header className="bg-background flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="mr-2 h-4" />

      {/* Multi-level breadcrumb - hidden on mobile to save space */}
      {breadcrumbSegments.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="hidden items-center gap-1 md:flex"
        >
          {breadcrumbSegments.map((seg, idx) => (
            <span key={idx} className="flex items-center gap-1">
              {idx > 0 && (
                <ChevronRight className="text-muted-foreground h-3.5 w-3.5" />
              )}
              {idx < breadcrumbSegments.length - 1 && seg.href ? (
                <Link
                  href={seg.href}
                  className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                >
                  {seg.label}
                </Link>
              ) : (
                <span className="text-foreground text-sm font-medium">
                  {seg.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-1">
        {/* Notifications — placeholder, no backend yet */}
        <Button
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 md:h-8 md:w-8"
          aria-label="{count} notifications"
        >
          <Bell className="h-4 w-4" />
        </Button>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 md:h-8 md:w-8"
              aria-label="User menu"
            >
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-[10px]">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium">
                {session?.user?.name ?? "User"}
              </p>
              <p className="text-muted-foreground text-xs">
                {session?.user?.email ?? ""}
              </p>
            </div>
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
