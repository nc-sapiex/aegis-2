"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

// ---- Types -------------------------------------------------------------------

interface Tab {
  key: string;
  label: string;
  href: string;
}

interface TabNavProps {
  tabs: Tab[];
}

// ---- Component ---------------------------------------------------------------

/**
 * URL-based tab navigation for RBIA engagement detail pages.
 *
 * Uses `usePathname()` for active tab detection. Each tab is a Next.js Link
 * pointing to a URL segment -- supports deep linking and browser back/forward.
 */
export function TabNav({ tabs }: TabNavProps) {
  const pathname = usePathname();

  return (
    <div className="border-border border-b">
      <nav className="-mb-px flex gap-4" aria-label="RBIA engagement tabs">
        {tabs.map((tab) => {
          // Exact match for the base /rbia path, prefix match for sub-paths
          const isActive =
            tab.key === "examination"
              ? pathname === tab.href || pathname === tab.href + "/"
              : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={cn(
                "border-b-2 px-1 py-3 text-sm font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "border-primary text-primary"
                  : "text-muted-foreground hover:text-foreground hover:border-border border-transparent",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
