"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpDown, ArrowUp, ArrowDown } from "@/lib/icons";
import { cn } from "@/lib/utils";
import type { BucketName } from "@/lib/sampling-engine";

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET_LABELS: Record<string, string> = {
  NEWLY_SANCTIONED: "Newly Sanctioned",
  AMOUNT_WISE: "Amount-wise",
  AGE_WISE: "Age-wise",
  DPD_WISE: "DPD-wise",
  PRIOR_OBSERVATIONS: "Prior Observations",
};

const BUCKET_BADGE_CLASSES: Record<string, string> = {
  NEWLY_SANCTIONED:
    "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  AMOUNT_WISE:
    "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  AGE_WISE:
    "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300 border-amber-200 dark:border-amber-800",
  DPD_WISE:
    "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300 border-red-200 dark:border-red-800",
  PRIOR_OBSERVATIONS:
    "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 border-green-200 dark:border-green-800",
};

// Indian currency formatter
const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey =
  | "accountNo"
  | "borrowerName"
  | "sanctionAmount"
  | "outstandingAmount"
  | "dpd";
type SortDir = "asc" | "desc";

interface SampledAccount {
  id: string;
  accountNo: string;
  borrowerName: string;
  sanctionAmount: number;
  outstandingAmount: number;
  dpd: number;
  assetClass: string;
  samplingBucket: string | null;
}

interface SampleListTableProps {
  accounts: SampledAccount[];
  engagementId: string;
}

function renderSortIcon(
  activeSortKey: SortKey,
  activeSortDir: SortDir,
  column: SortKey,
) {
  if (activeSortKey !== column) {
    return <ArrowUpDown className="ml-1 inline h-3 w-3 opacity-40" />;
  }

  return activeSortDir === "asc" ? (
    <ArrowUp className="ml-1 inline h-3 w-3" />
  ) : (
    <ArrowDown className="ml-1 inline h-3 w-3" />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Displays sampled loan accounts with colored bucket badges.
 * Supports client-side sorting and filtering by bucket.
 *
 * SMPL-04: Sample display with colored bucket badges
 */
export function SampleListTable({
  accounts,
  engagementId,
}: SampleListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("accountNo");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [filterBucket, setFilterBucket] = useState<string>("all");

  // ─── Sorting ───────────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  // ─── Filter + Sort ─────────────────────────────────────────────────────────

  const filtered =
    filterBucket === "all"
      ? accounts
      : accounts.filter((a) => a.samplingBucket === filterBucket);

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "accountNo":
        return a.accountNo.localeCompare(b.accountNo) * dir;
      case "borrowerName":
        return a.borrowerName.localeCompare(b.borrowerName) * dir;
      case "sanctionAmount":
        return (a.sanctionAmount - b.sanctionAmount) * dir;
      case "outstandingAmount":
        return (a.outstandingAmount - b.outstandingAmount) * dir;
      case "dpd":
        return (a.dpd - b.dpd) * dir;
      default:
        return 0;
    }
  });

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Selected Sample
            <Badge variant="secondary" className="ml-2">
              {accounts.length} accounts
            </Badge>
          </CardTitle>

          {/* Bucket filter */}
          <Select value={filterBucket} onValueChange={setFilterBucket}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Buckets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Buckets</SelectItem>
              {Object.entries(BUCKET_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer whitespace-nowrap select-none"
                onClick={() => handleSort("accountNo")}
              >
                Account No
                {renderSortIcon(sortKey, sortDir, "accountNo")}
              </TableHead>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => handleSort("borrowerName")}
              >
                Borrower Name
                {renderSortIcon(sortKey, sortDir, "borrowerName")}
              </TableHead>
              <TableHead
                className="cursor-pointer text-right select-none"
                onClick={() => handleSort("sanctionAmount")}
              >
                Sanction Amount
                {renderSortIcon(sortKey, sortDir, "sanctionAmount")}
              </TableHead>
              <TableHead
                className="cursor-pointer text-right select-none"
                onClick={() => handleSort("outstandingAmount")}
              >
                Outstanding
                {renderSortIcon(sortKey, sortDir, "outstandingAmount")}
              </TableHead>
              <TableHead
                className="cursor-pointer text-right select-none"
                onClick={() => handleSort("dpd")}
              >
                DPD
                {renderSortIcon(sortKey, sortDir, "dpd")}
              </TableHead>
              <TableHead>Asset Class</TableHead>
              <TableHead>Criteria Bucket</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  No accounts match the selected filter.
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((account) => (
                <TableRow
                  key={account.id}
                  className="hover:bg-muted cursor-pointer"
                >
                  <TableCell className="font-mono text-sm">
                    <Link
                      href={`/audit-execution/${engagementId}/rbia/account/${account.id}`}
                      className="block"
                    >
                      {account.accountNo}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/audit-execution/${engagementId}/rbia/account/${account.id}`}
                      className="block"
                    >
                      {account.borrowerName}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/audit-execution/${engagementId}/rbia/account/${account.id}`}
                      className="block"
                    >
                      {INR.format(account.sanctionAmount)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/audit-execution/${engagementId}/rbia/account/${account.id}`}
                      className="block"
                    >
                      {INR.format(account.outstandingAmount)}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/audit-execution/${engagementId}/rbia/account/${account.id}`}
                      className="block"
                    >
                      {account.dpd}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/audit-execution/${engagementId}/rbia/account/${account.id}`}
                      className="block"
                    >
                      <span className="text-sm">{account.assetClass}</span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/audit-execution/${engagementId}/rbia/account/${account.id}`}
                      className="block"
                    >
                      {account.samplingBucket ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-medium",
                            BUCKET_BADGE_CLASSES[account.samplingBucket] ?? "",
                          )}
                        >
                          {BUCKET_LABELS[account.samplingBucket] ??
                            account.samplingBucket}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
