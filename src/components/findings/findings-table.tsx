"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
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
import { FindingsFilters } from "./findings-filters";
import {
  SEVERITY_COLORS,
  OBSERVATION_STATUS_COLORS,
  OBSERVATION_STATUS_ORDER,
} from "@/lib/constants";
import { ArrowUp, ArrowDown, ArrowUpDown } from "@/lib/icons";
import { SeverityBadge } from "@/components/ui/severity-badge";

// Observation row shape matching the DAL return type
interface ObservationRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  resolvedDuringFieldwork?: boolean;
  dueDate?: Date | string | null;
  createdAt: Date | string;
  branch?: { id: string; name: string } | null;
  auditArea?: { id: string; name: string } | null;
  createdBy?: { id: string; name: string } | null;
  // Legacy JSON fields
  category?: string;
  assignedAuditor?: string;
}

interface FindingsTableProps {
  observations: ObservationRow[];
}

// Custom sort orders
const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  critical: 0,
  HIGH: 1,
  high: 1,
  MEDIUM: 2,
  medium: 2,
  LOW: 3,
  low: 3,
};

function SortIcon({
  column,
}: {
  column: { getIsSorted: () => false | "asc" | "desc" };
}) {
  const sorted = column.getIsSorted();
  if (sorted === "asc") return <ArrowUp className="ml-1 h-3.5 w-3.5" />;
  if (sorted === "desc") return <ArrowDown className="ml-1 h-3.5 w-3.5" />;
  return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-50" />;
}

function formatSeverity(severity: string): string {
  return severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase();
}

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function calculateAge(createdAt: Date | string): number {
  const date = typeof createdAt === "string" ? new Date(createdAt) : createdAt;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function ageColorClass(days: number): string {
  if (days > 180) return "text-red-600 font-medium";
  if (days > 120) return "text-amber-600 font-medium";
  if (days <= 60) return "text-green-600";
  return "text-muted-foreground";
}

const columns: ColumnDef<ObservationRow>[] = [
  {
    accessorKey: "title",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Title
        <SortIcon column={column} />
      </Button>
    ),
    cell: ({ row }) => (
      <div className="space-y-0.5">
        <span className="line-clamp-2 text-sm font-medium md:text-base">
          {row.getValue("title")}
        </span>
        {row.original.resolvedDuringFieldwork && (
          <Badge
            variant="outline"
            className="border-amber-200 bg-amber-100 text-amber-800"
          >
            Resolved
          </Badge>
        )}
      </div>
    ),
  },
  {
    id: "auditArea",
    accessorFn: (row) => row.auditArea?.name ?? row.category ?? "—",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 hidden md:flex"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Audit Area
        <SortIcon column={column} />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="hidden text-sm md:inline">
        {row.getValue("auditArea")}
      </span>
    ),
  },
  {
    accessorKey: "severity",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Severity
        <SortIcon column={column} />
      </Button>
    ),
    cell: ({ row }) => {
      const severity = row.getValue("severity") as string;
      return (
        <SeverityBadge severity={severity} label={formatSeverity(severity)} />
      );
    },
    sortingFn: (rowA, rowB) => {
      const a = SEVERITY_ORDER[rowA.getValue("severity") as string] ?? 99;
      const b = SEVERITY_ORDER[rowB.getValue("severity") as string] ?? 99;
      return a - b;
    },
    filterFn: (row, _id, value) => {
      const severity = (row.getValue("severity") as string).toUpperCase();
      return severity === value.toUpperCase();
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Status
        <SortIcon column={column} />
      </Button>
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      const key =
        status.toUpperCase() as keyof typeof OBSERVATION_STATUS_COLORS;
      return (
        <Badge
          variant="outline"
          className={OBSERVATION_STATUS_COLORS[key] ?? ""}
        >
          {formatStatus(status)}
        </Badge>
      );
    },
    sortingFn: (rowA, rowB) => {
      const statusA = (rowA.getValue("status") as string).toUpperCase();
      const statusB = (rowB.getValue("status") as string).toUpperCase();
      const a = OBSERVATION_STATUS_ORDER[statusA] ?? 99;
      const b = OBSERVATION_STATUS_ORDER[statusB] ?? 99;
      return a - b;
    },
    filterFn: (row, _id, value) => {
      const status = (row.getValue("status") as string).toUpperCase();
      return status === value.toUpperCase();
    },
  },
  {
    id: "branch",
    accessorFn: (row) => row.branch?.name ?? "—",
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 hidden md:flex"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Branch
        <SortIcon column={column} />
      </Button>
    ),
    cell: ({ row }) => (
      <span className="hidden text-sm md:inline">{row.getValue("branch")}</span>
    ),
  },
  {
    id: "age",
    accessorFn: (row) => calculateAge(row.createdAt),
    header: ({ column }) => (
      <Button
        variant="ghost"
        size="sm"
        className="-ml-3 hidden md:flex"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Age (days)
        <SortIcon column={column} />
      </Button>
    ),
    cell: ({ row }) => {
      const days = row.getValue("age") as number;
      return (
        <span className={`hidden text-sm md:inline ${ageColorClass(days)}`}>
          {days}d
        </span>
      );
    },
    sortingFn: "basic",
  },
];

export function FindingsTable({ observations }: FindingsTableProps) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    [],
  );

  // Filter state for dropdowns
  const [severityFilter, setSeverityFilter] = React.useState("all");
  const [statusFilter, setStatusFilter] = React.useState("all");

  const table = useReactTable({
    data: observations,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const handleSeverityChange = (value: string) => {
    setSeverityFilter(value);
    if (value === "all") {
      setColumnFilters((prev) => prev.filter((f) => f.id !== "severity"));
    } else {
      setColumnFilters((prev) => {
        const other = prev.filter((f) => f.id !== "severity");
        return [...other, { id: "severity", value }];
      });
    }
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    if (value === "all") {
      setColumnFilters((prev) => prev.filter((f) => f.id !== "status"));
    } else {
      setColumnFilters((prev) => {
        const other = prev.filter((f) => f.id !== "status");
        return [...other, { id: "status", value }];
      });
    }
  };

  const handleReset = () => {
    setSeverityFilter("all");
    setStatusFilter("all");
    setColumnFilters([]);
  };

  const totalCount = observations.length;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const isFiltered = filteredCount !== totalCount;

  return (
    <div className="space-y-4">
      <FindingsFilters
        severityFilter={severityFilter}
        statusFilter={statusFilter}
        onSeverityChange={handleSeverityChange}
        onStatusChange={handleStatusChange}
        onReset={handleReset}
      />

      <div className="text-muted-foreground text-sm">
        {isFiltered
          ? `Showing ${filteredCount} of ${totalCount} observations`
          : `${totalCount} observations`}
      </div>

      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className="hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/findings/${row.original.id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/findings/${row.original.id}`);
                      }
                    }}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No observations match the selected filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
