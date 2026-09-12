"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import { CheckCircle2, Clock } from "@/lib/icons";

// ─── Types ──────────────────────────────────────────────────────────────────

interface PendingResponseItem {
  id: string;
  title: string;
  branchName: string | null;
  issuedDate: string | null;
}

interface PendingResponsesProps {
  count: number;
  items: PendingResponseItem[];
}

// ─── Component ──────────────────────────────────────────────────────────────

export function PendingResponses({ count, items }: PendingResponsesProps) {
  if (count === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Pending Responses
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <CheckCircle2 className="mb-2 h-8 w-8 text-green-600 dark:text-green-400" />
            <p className="text-sm font-medium">
              All observations have responses
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              No auditee responses are pending.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          Pending Responses
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            {count}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.slice(0, 10).map((item) => (
            <li key={item.id} className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/findings/${item.id}`}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {item.title}
                </Link>
                <div className="text-muted-foreground flex gap-2 text-xs">
                  {item.branchName && <span>{item.branchName}</span>}
                  {item.issuedDate && (
                    <span>
                      Issued{" "}
                      {new Date(item.issuedDate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
