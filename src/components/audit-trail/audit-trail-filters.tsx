"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter } from "@/lib/icons";

interface CurrentFilters {
  tableName: string;
  userId: string;
  actionType: string;
  dateFrom: string;
  dateTo: string;
}

interface AuditTrailFiltersProps {
  tableNames: string[];
  actionTypes: string[];
  currentFilters: CurrentFilters;
}

/** Display-friendly table name mapping */
const TABLE_DISPLAY_NAMES: Record<string, string> = {
  Tenant: "Tenant",
  User: "User",
  Branch: "Branch",
  AuditArea: "Audit Area",
  AuditPlan: "Audit Plan",
  AuditEngagement: "Audit Engagement",
  Observation: "Observation",
  ObservationTimeline: "Observation Timeline",
  Evidence: "Evidence",
  ComplianceRequirement: "Compliance Requirement",
};

/** Display-friendly action type mapping */
function formatActionType(actionType: string): string {
  return actionType
    .split(".")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" - ")
    .replace(/_/g, " ");
}

export function AuditTrailFilters({
  tableNames,
  actionTypes,
  currentFilters,
}: AuditTrailFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams();

      // Copy current filters
      const filters = { ...currentFilters, [key]: value };

      // Build search params (omit empty values)
      Object.entries(filters).forEach(([k, v]) => {
        if (v && v !== "all") {
          params.set(k, v);
        }
      });

      // Reset to page 1 when filters change
      router.push(`${pathname}?${params.toString()}`);
    },
    [currentFilters, pathname, router],
  );

  const resetFilters = useCallback(() => {
    router.push(pathname);
  }, [pathname, router]);

  const hasActiveFilters = Object.values(currentFilters).some(
    (v) => v && v !== "all",
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Filter className="h-4 w-4" />
        Filters
      </div>

      <Select
        value={currentFilters.tableName || "all"}
        onValueChange={(v) => updateFilter("tableName", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-full sm:w-[180px]">
          <SelectValue placeholder="All Entities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Entities</SelectItem>
          {tableNames.map((name) => (
            <SelectItem key={name} value={name}>
              {TABLE_DISPLAY_NAMES[name] ?? name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentFilters.actionType || "all"}
        onValueChange={(v) => updateFilter("actionType", v === "all" ? "" : v)}
      >
        <SelectTrigger className="w-full sm:w-[200px]">
          <SelectValue placeholder="All Actions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Actions</SelectItem>
          {actionTypes.map((type) => (
            <SelectItem key={type} value={type}>
              {formatActionType(type)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        placeholder="From date"
        value={currentFilters.dateFrom}
        onChange={(e) => updateFilter("dateFrom", e.target.value)}
        className="w-full sm:w-[160px]"
      />

      <Input
        type="date"
        placeholder="To date"
        value={currentFilters.dateTo}
        onChange={(e) => updateFilter("dateTo", e.target.value)}
        className="w-full sm:w-[160px]"
      />

      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Reset
        </Button>
      )}
    </div>
  );
}
