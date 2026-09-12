"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CalendarDays, LayoutGrid } from "@/lib/icons";

interface AuditFilterBarProps {
  typeFilter: string;
  onTypeChange: (type: string) => void;
  viewMode: "calendar" | "cards";
  onViewModeChange: (mode: "calendar" | "cards") => void;
}

export function AuditFilterBar({
  typeFilter,
  onTypeChange,
  viewMode,
  onViewModeChange,
}: AuditFilterBarProps) {
  return (
    <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
      {/* Audit Type Filter */}
      <Select value={typeFilter} onValueChange={onTypeChange}>
        <SelectTrigger className="bg-muted w-full sm:w-[180px]">
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="branch-audit">Branch Audit</SelectItem>
          <SelectItem value="is-audit">IS Audit</SelectItem>
          <SelectItem value="credit-audit">Credit Audit</SelectItem>
          <SelectItem value="compliance-audit">Compliance Audit</SelectItem>
          <SelectItem value="revenue-audit">Revenue Audit</SelectItem>
        </SelectContent>
      </Select>

      {/* View Mode Toggle */}
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onViewModeChange("calendar")}
          className={`h-10 w-10 md:h-9 md:w-9 ${viewMode === "calendar" ? "bg-accent text-accent-foreground" : ""}`}
          aria-label="Calendar view"
          aria-pressed={viewMode === "calendar"}
        >
          <CalendarDays className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onViewModeChange("cards")}
          className={`h-10 w-10 md:h-9 md:w-9 ${viewMode === "cards" ? "bg-accent text-accent-foreground" : ""}`}
          aria-label="Card grid view"
          aria-pressed={viewMode === "cards"}
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
