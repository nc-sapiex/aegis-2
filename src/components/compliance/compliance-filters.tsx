"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ComplianceFiltersProps {
  categoryFilter: string;
  statusFilter: string;
  onCategoryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onReset: () => void;
}

export function ComplianceFilters({
  categoryFilter,
  statusFilter,
  onCategoryChange,
  onStatusChange,
  onReset,
}: ComplianceFiltersProps) {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
      <Select value={categoryFilter} onValueChange={onCategoryChange}>
        <SelectTrigger className="bg-muted w-full sm:w-[180px]">
          <SelectValue placeholder="All Categories" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          <SelectItem value="risk-management">Risk Management</SelectItem>
          <SelectItem value="governance">Governance</SelectItem>
          <SelectItem value="operations">Operations</SelectItem>
          <SelectItem value="it">IT</SelectItem>
          <SelectItem value="credit">Credit</SelectItem>
          <SelectItem value="market-risk">Market Risk</SelectItem>
        </SelectContent>
      </Select>

      <Select value={statusFilter} onValueChange={onStatusChange}>
        <SelectTrigger className="bg-muted w-full sm:w-[180px]">
          <SelectValue placeholder="All Statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Statuses</SelectItem>
          <SelectItem value="compliant">Compliant</SelectItem>
          <SelectItem value="partial">Partial</SelectItem>
          <SelectItem value="non-compliant">Non-Compliant</SelectItem>
          <SelectItem value="pending">Pending</SelectItem>
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        disabled={categoryFilter === "all" && statusFilter === "all"}
      >
        Reset
      </Button>
    </div>
  );
}
