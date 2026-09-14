"use client";

import { cn } from "@/lib/utils";
import { formatRatio } from "@/lib/format-score";
import type { ScoreLabel } from "@/generated/prisma/enums";

const SCALE: { label: ScoreLabel; short: string }[] = [
  { label: "FULLY_COMPLIANT", short: "F" },
  { label: "LARGELY_COMPLIANT", short: "L" },
  { label: "PARTIALLY_COMPLIANT", short: "P" },
  { label: "MARGINALLY_COMPLIANT", short: "M" },
  { label: "NON_COMPLIANT", short: "N" },
];

export function ScaleTick({
  statementCode,
  statementText,
  value,
  isNotApplicable,
  disabled,
  onScore,
  onToggleNa,
}: {
  statementCode: string;
  statementText: string;
  value: ScoreLabel | null;
  isNotApplicable: boolean;
  disabled: boolean;
  onScore: (label: ScoreLabel) => void;
  onToggleNa: (na: boolean) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`${statementCode}, ${statementText}`}
      className="flex items-center gap-2"
    >
      {SCALE.map((option) => {
        const selected = !isNotApplicable && value === option.label;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={`${option.label.replace(/_/g, " ")}, ${formatRatio(option.label)}`}
            disabled={disabled || isNotApplicable}
            onClick={() => onScore(option.label)}
            className={cn(
              "h-[22px] min-h-11 w-[22px] min-w-11 rounded-full border",
              "border-[color:var(--border-strong)]",
              selected &&
                option.label === "NON_COMPLIANT" &&
                "bg-[color:var(--destructive)]",
              selected &&
                option.label !== "NON_COMPLIANT" &&
                "bg-[color:var(--primary)]",
            )}
          />
        );
      })}
      <button
        type="button"
        role="checkbox"
        aria-checked={isNotApplicable}
        aria-label="Not applicable"
        disabled={disabled}
        onClick={() => onToggleNa(!isNotApplicable)}
        className={cn(
          "h-[22px] min-h-11 w-[22px] min-w-11 rounded-[2px] border",
          "border-[color:var(--border-strong)]",
          isNotApplicable && "bg-[color:var(--foreground)]",
        )}
      />
    </div>
  );
}
