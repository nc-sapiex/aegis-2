"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDownIcon,
  ChevronUp,
} from "@/lib/icons";
import { formatDate } from "@/lib/utils";

/** Serialized audit log entry (BigInt converted to string, dates to ISO strings) */
export interface SerializedAuditLogEntry {
  id: string;
  sequenceNumber: string;
  tenantId: string;
  tableName: string;
  recordId: string;
  operation: string;
  actionType: string | null;
  oldData: unknown | null;
  newData: unknown | null;
  userId: string | null;
  userName: string | null;
  justification: string | null;
  ipAddress: string | null;
  sessionId: string | null;
  retentionExpiresAt: string | null;
  createdAt: string;
}

interface AuditTrailTableProps {
  entries: SerializedAuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Display-friendly table name */
const TABLE_DISPLAY: Record<string, string> = {
  Tenant: "Tenant",
  User: "User",
  Branch: "Branch",
  AuditArea: "Audit Area",
  AuditPlan: "Audit Plan",
  AuditEngagement: "Audit Engagement",
  Observation: "Observation",
  ObservationTimeline: "Timeline",
  Evidence: "Evidence",
  ComplianceRequirement: "Compliance",
};

/** Operation badge colors */
const OPERATION_COLORS: Record<string, string> = {
  INSERT:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  UPDATE: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  DELETE: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

/** Sensitive action types that should be highlighted */
const SENSITIVE_ACTIONS = new Set([
  "user.role_changed",
  "user.deactivated",
  "finding.closed",
  "compliance.marked_na",
  "observation.approved",
]);

/** Format action type for display */
function formatActionType(actionType: string): string {
  return actionType
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" \u2022 ")
    .replace(/_/g, " ");
}

/** Format time from ISO string */
function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** Render JSON diff viewer */
function JsonDiff({
  oldData,
  newData,
}: {
  oldData: unknown | null;
  newData: unknown | null;
}) {
  if (!oldData && !newData) {
    return <span className="text-muted-foreground text-sm">No data</span>;
  }

  return (
    <div className="grid gap-2 md:grid-cols-2">
      {oldData != null ? (
        <div>
          <span className="text-xs font-medium text-red-600 dark:text-red-400">
            Before:
          </span>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-red-50 p-2 text-xs dark:bg-red-950/20">
            {JSON.stringify(oldData, null, 2)}
          </pre>
        </div>
      ) : null}
      {newData != null ? (
        <div>
          <span className="text-xs font-medium text-green-600 dark:text-green-400">
            After:
          </span>
          <pre className="mt-1 max-h-48 overflow-auto rounded bg-green-50 p-2 text-xs dark:bg-green-950/20">
            {JSON.stringify(newData, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function AuditTrailTable({
  entries,
  total,
  page,
  pageSize,
  totalPages,
}: AuditTrailTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const goToPage = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`${pathname}?${params.toString()}`);
  };

  const startEntry = (page - 1) * pageSize + 1;
  const endEntry = Math.min(page * pageSize, total);

  return (
    <div className="space-y-4">
      <div className="text-muted-foreground text-sm">
        {total === 0
          ? "No audit entries found"
          : `Showing ${startEntry}-${endEntry} of ${total} entries`}
      </div>

      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-20">Seq #</TableHead>
                <TableHead>Date / Time</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead className="hidden md:table-cell">
                  Record ID
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    No audit trail entries found.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => {
                  const isExpanded = expandedRows.has(entry.id);
                  const isSensitive =
                    entry.actionType && SENSITIVE_ACTIONS.has(entry.actionType);

                  return (
                    <TableRow
                      key={entry.id}
                      className={
                        isSensitive
                          ? "bg-amber-50/50 dark:bg-amber-950/10"
                          : undefined
                      }
                    >
                      <TableCell colSpan={8} className="p-0">
                        <div
                          className="hover:bg-muted/50 flex cursor-pointer items-center px-4 py-3 transition-colors"
                          onClick={() => toggleRow(entry.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              toggleRow(entry.id);
                            }
                          }}
                        >
                          <div className="mr-3 w-4 shrink-0">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDownIcon className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-[60px] shrink-0 font-mono text-xs">
                            {entry.sequenceNumber}
                          </div>
                          <div className="min-w-[140px] shrink-0 text-sm">
                            <div>{formatDate(entry.createdAt)}</div>
                            <div className="text-muted-foreground text-xs">
                              {formatTime(entry.createdAt)}
                            </div>
                          </div>
                          <div className="min-w-[120px] shrink-0 text-sm">
                            {entry.userName ?? entry.userId ?? "System"}
                          </div>
                          <div className="min-w-[100px] shrink-0 text-sm">
                            {TABLE_DISPLAY[entry.tableName] ?? entry.tableName}
                          </div>
                          <div className="min-w-[140px] shrink-0">
                            {entry.actionType ? (
                              <span
                                className={`text-sm ${isSensitive ? "font-medium text-amber-700 dark:text-amber-400" : ""}`}
                              >
                                {formatActionType(entry.actionType)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                -
                              </span>
                            )}
                          </div>
                          <div className="min-w-[80px] shrink-0">
                            <Badge
                              className={
                                OPERATION_COLORS[entry.operation] ?? ""
                              }
                              variant="outline"
                            >
                              {entry.operation}
                            </Badge>
                          </div>
                          <div className="hidden font-mono text-xs md:block">
                            {entry.recordId.substring(0, 8)}...
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="border-t px-4 py-3">
                            <div className="space-y-3">
                              <div className="grid gap-2 text-sm md:grid-cols-3">
                                <div>
                                  <span className="text-muted-foreground">
                                    Record ID:
                                  </span>{" "}
                                  <span className="font-mono text-xs">
                                    {entry.recordId}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    IP Address:
                                  </span>{" "}
                                  {entry.ipAddress || "N/A"}
                                </div>
                                <div>
                                  <span className="text-muted-foreground">
                                    Session:
                                  </span>{" "}
                                  <span className="font-mono text-xs">
                                    {entry.sessionId
                                      ? `${entry.sessionId.substring(0, 8)}...`
                                      : "N/A"}
                                  </span>
                                </div>
                              </div>

                              {entry.justification && (
                                <div className="text-sm">
                                  <span className="font-medium text-amber-700 dark:text-amber-400">
                                    Justification:
                                  </span>{" "}
                                  {entry.justification}
                                </div>
                              )}

                              <JsonDiff
                                oldData={entry.oldData}
                                newData={entry.newData}
                              />
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-muted-foreground text-sm">
            Page {page} of {totalPages}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
