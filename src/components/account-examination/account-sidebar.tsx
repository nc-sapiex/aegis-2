"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { CheckCircle2 } from "@/lib/icons";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountSidebarAccount {
  id: string;
  accountNo: string;
  borrowerName: string;
  totalQuestions: number;
  answeredQuestions: number;
  violationCount: number;
}

interface AccountSidebarProps {
  accounts: AccountSidebarAccount[];
  selectedAccountId: string | null;
  engagementId: string;
  moduleCode: string;
}

// ─── Status dot color ─────────────────────────────────────────────────────────

function getStatusDotClass(
  answeredQuestions: number,
  totalQuestions: number,
): string {
  if (totalQuestions === 0) return "bg-gray-300 dark:bg-gray-600";
  if (answeredQuestions >= totalQuestions) return "bg-green-500";
  if (answeredQuestions > 0) return "bg-amber-500";
  return "bg-gray-300 dark:bg-gray-600";
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Scrollable left sidebar listing all sampled accounts for examination.
 *
 * Each item shows:
 * - Account number (monospace, bold)
 * - Borrower name (truncated)
 * - Completion progress (answered/total)
 * - Colored status dot (green = complete, amber = partial, gray = not started)
 * - Green checkmark when account is fully answered
 *
 * Clicking any account sets ?accountId= in the URL to load its questions.
 * Free navigation — no forced linear order.
 *
 * AEXM-01: Account-centric navigation for examination workflow.
 */
export function AccountSidebar({
  accounts,
  selectedAccountId,
  engagementId,
  moduleCode,
}: AccountSidebarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleAccountSelect = useCallback(
    (accountId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("accountId", accountId);
      router.push(
        `/audit-execution/${engagementId}/rbia/examination/${moduleCode}?${params.toString()}`,
      );
    },
    [router, searchParams, engagementId, moduleCode],
  );

  return (
    <Card className="overflow-hidden">
      <div className="border-border border-b px-3 py-2">
        <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          Sampled Accounts ({accounts.length})
        </p>
      </div>
      <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
        {accounts.map((account) => {
          const isSelected = account.id === selectedAccountId;
          const isComplete =
            account.totalQuestions > 0 &&
            account.answeredQuestions >= account.totalQuestions;
          const dotClass = getStatusDotClass(
            account.answeredQuestions,
            account.totalQuestions,
          );

          return (
            <button
              key={account.id}
              type="button"
              onClick={() => handleAccountSelect(account.id)}
              className={cn(
                "border-border w-full border-b px-3 py-3 text-left transition-colors last:border-b-0",
                isSelected ? "bg-accent" : "hover:bg-muted/50 cursor-pointer",
              )}
            >
              <div className="flex items-start gap-2">
                {/* Status dot */}
                <span
                  className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", dotClass)}
                  aria-hidden="true"
                />

                {/* Account info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono text-sm font-semibold tabular-nums">
                      {account.accountNo}
                    </span>
                    {isComplete && (
                      <CheckCircle2
                        className="h-3.5 w-3.5 shrink-0 text-green-500"
                        aria-label="Complete"
                      />
                    )}
                  </div>
                  <p className="text-muted-foreground truncate text-xs">
                    {account.borrowerName}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-muted-foreground text-xs">
                      {account.answeredQuestions}/{account.totalQuestions}
                    </span>
                    {account.violationCount > 0 && (
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        {account.violationCount} violation
                        {account.violationCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
