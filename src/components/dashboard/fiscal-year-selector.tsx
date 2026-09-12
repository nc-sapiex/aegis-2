"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  getCurrentFiscalYear,
  getCurrentQuarter,
  getQuarterLabel,
  ALL_QUARTERS,
  type Quarter,
} from "@/lib/fiscal-year";

interface FiscalYearSelectorProps {
  onChange: (value: { year: number; quarter: Quarter | null }) => void;
}

export function FiscalYearSelector({ onChange }: FiscalYearSelectorProps) {
  const currentFY = getCurrentFiscalYear();
  const currentQ = getCurrentQuarter();

  const [selectedYear, setSelectedYear] = useState(currentFY.year);
  const [selectedQuarter, setSelectedQuarter] = useState<Quarter | null>(
    currentQ,
  );

  const previousFY = {
    year: currentFY.year - 1,
    label: `${currentFY.year - 1}-${String(currentFY.year).slice(2)}`,
  };

  const fyOptions = [
    { year: currentFY.year, label: `FY ${currentFY.label}` },
    { year: previousFY.year, label: `FY ${previousFY.label}` },
  ];

  function handleYearChange(yearStr: string) {
    const year = parseInt(yearStr, 10);
    setSelectedYear(year);
    onChange({ year, quarter: selectedQuarter });
  }

  function handleQuarterChange(value: string) {
    const quarter = value === "" ? null : (value as Quarter);
    setSelectedQuarter(quarter);
    onChange({ year: selectedYear, quarter });
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={String(selectedYear)} onValueChange={handleYearChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fyOptions.map((opt) => (
            <SelectItem key={opt.year} value={String(opt.year)}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroup
        type="single"
        value={selectedQuarter ?? ""}
        onValueChange={handleQuarterChange}
        className="hidden sm:flex"
      >
        <ToggleGroupItem value="" className="text-xs">
          All
        </ToggleGroupItem>
        {ALL_QUARTERS.map((q) => (
          <ToggleGroupItem key={q} value={q} className="text-xs">
            {getQuarterLabel(q).split(" ")[0]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
