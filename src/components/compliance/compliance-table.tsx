"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, ArrowUpDown } from "@/lib/icons";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";
import Link from "next/link";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { BranchResponseForm } from "./branch-response-form";
import { ZacReviewPanel } from "./zac-review-panel";

interface ComplianceTableProps {
  items: Array<{
    id: string;
    status: string;
    dueDate: Date | null;
    daysOpen: number;
    escalationLevel: number;
    branchResponseText: string | null;
    branchResponseDate: Date | null;
    zacReviewDecision: string | null;
    observation: {
      id: string;
      title: string;
      severity: string;
      status: string;
    } | null;
    branch: {
      id: string;
      code: string;
      name: string;
      city: string;
    } | null;
    audit: {
      id: string;
      auditNumber: string | null;
      auditType: string | null;
    } | null;
  }>;
  canUpdate: boolean;
  canBranchResponse: boolean;
  canZacReview: boolean;
}

// Colors imported from central constants
import {
  COMPLIANCE_STATUS_COLORS as STATUS_COLORS,
  SEVERITY_BADGE_COLORS as SEVERITY_COLORS,
} from "@/lib/constants";

export function ComplianceTable({
  items,
  canUpdate,
  canBranchResponse,
  canZacReview,
}: ComplianceTableProps) {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortField, setSortField] = React.useState<"dueDate" | "daysOpen">(
    "daysOpen",
  );
  const [sortDirection, setSortDirection] = React.useState<"asc" | "desc">(
    "desc",
  );

  // Branch response dialog
  const [branchResponseItem, setBranchResponseItem] = React.useState<
    string | null
  >(null);
  // ZAC review dialog
  const [zacReviewItem, setZacReviewItem] = React.useState<string | null>(null);

  // Filter and sort
  const filteredItems = React.useMemo(() => {
    let result = items;

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((item) => item.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.observation?.title.toLowerCase().includes(query) ||
          item.branch?.name.toLowerCase().includes(query) ||
          item.branch?.code.toLowerCase().includes(query),
      );
    }

    // Sort
    result = [...result].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      if (sortField === "dueDate") {
        aVal = a.dueDate ? new Date(a.dueDate).getTime() : 0;
        bVal = b.dueDate ? new Date(b.dueDate).getTime() : 0;
      } else {
        aVal = a.daysOpen;
        bVal = b.daysOpen;
      }

      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });

    return result;
  }, [items, statusFilter, searchQuery, sortField, sortDirection]);

  const toggleSort = (field: "dueDate" | "daysOpen") => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder="Search by title, branch..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <div className="flex items-center gap-2">
          <Filter className="text-muted-foreground h-4 w-4" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="BRANCH_RESPONSE_DUE">Response Due</SelectItem>
              <SelectItem value="BRANCH_RESPONSE_SUBMITTED">
                Submitted
              </SelectItem>
              <SelectItem value="ZAC_REVIEW">ZAC Review</SelectItem>
              <SelectItem value="ZAC_APPROVED">Approved</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead>Observation</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleSort("daysOpen")}
                  className="h-8 px-2"
                >
                  Days Open
                  <ArrowUpDown className="ml-1 h-3 w-3" />
                </Button>
              </TableHead>
              <TableHead>Escalation</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7}>
                  <EmptyStateCard
                    variant="inline"
                    title="No compliance items found"
                    message="Compliance items will appear here once observations are raised and tracked."
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">
                    {item.branch?.code ?? "—"}
                    <div className="text-muted-foreground text-xs">
                      {item.branch?.name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {item.observation ? (
                      <Link
                        href={`/findings/${item.observation.id}`}
                        className="text-primary max-w-xs truncate hover:underline"
                        title={item.observation.title}
                      >
                        {item.observation.title}
                      </Link>
                    ) : (
                      <span className="max-w-xs truncate">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {item.observation?.severity ? (
                      <SeverityBadge severity={item.observation.severity} />
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={STATUS_COLORS[item.status] ?? ""}
                    >
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.daysOpen}</TableCell>
                  <TableCell>
                    <Badge variant="outline">L{item.escalationLevel}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {canBranchResponse &&
                        (item.status === "OPEN" ||
                          item.status === "BRANCH_RESPONSE_DUE") && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setBranchResponseItem(item.id)}
                          >
                            Respond
                          </Button>
                        )}
                      {canZacReview &&
                        item.status === "BRANCH_RESPONSE_SUBMITTED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setZacReviewItem(item.id)}
                          >
                            Review
                          </Button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Branch Response Dialog */}
      {branchResponseItem && (
        <BranchResponseForm
          complianceItemId={branchResponseItem}
          open={!!branchResponseItem}
          onOpenChange={(open) => !open && setBranchResponseItem(null)}
        />
      )}

      {/* ZAC Review Dialog */}
      {zacReviewItem && (
        <ZacReviewPanel
          complianceItemId={zacReviewItem}
          open={!!zacReviewItem}
          onOpenChange={(open) => !open && setZacReviewItem(null)}
        />
      )}
    </div>
  );
}
