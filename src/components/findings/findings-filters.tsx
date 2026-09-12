"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { XCircle } from "@/lib/icons";

export interface FindingsFiltersProps {
  severityFilter: string;
  statusFilter: string;
  onSeverityChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onReset: () => void;
}

export function FindingsFilters({
  severityFilter,
  statusFilter,
  onSeverityChange,
  onStatusChange,
  onReset,
}: FindingsFiltersProps) {
  const isFiltered = severityFilter !== "all" || statusFilter !== "all";

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select value={severityFilter} onValueChange={onSeverityChange}>
        <SelectTrigger className="bg-muted w-full sm:w-[160px]">
          <SelectValue placeholder="All Severities" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Severities</SelectItem>
          <SelectItem value="CRITICAL">Critical</SelectItem>
          <SelectItem value="HIGH">High</SelectItem>
          <SelectItem value="MEDIUM">Medium</SelectItem>
          <SelectItem value="LOW">Low</SelectItem>
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="bg-muted w-full sm:w-[160px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="DRAFT">Draft</SelectItem>
          <SelectItem value="SUBMITTED">Submitted</SelectItem>
          <SelectItem value="REVIEWED">Reviewed</SelectItem>
          <SelectItem value="ISSUED">Issued</SelectItem>
          <SelectItem value="RESPONSE">Response</SelectItem>
          <SelectItem value="COMPLIANCE">Compliance</SelectItem>
          <SelectItem value="CLOSED">Closed</SelectItem>
        </SelectContent>
      </Select>

      {isFiltered && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          <XCircle className="mr-1 h-4 w-4" />
          Reset
        </Button>
      )}
    </div>
  );
}
