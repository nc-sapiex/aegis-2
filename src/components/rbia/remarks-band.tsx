"use client";

import { Textarea } from "@/components/ui/textarea";
import type { StatementState } from "@/lib/statement-state";

export function RemarksBand({
  state,
  isNotApplicable,
  remarks,
  naReason,
  scoreEffect,
  disabled,
  onChangeRemarks,
  onChangeNaReason,
}: {
  state: StatementState;
  isNotApplicable: boolean;
  remarks: string;
  naReason: string;
  scoreEffect: string | null;
  disabled?: boolean;
  onChangeRemarks: (v: string) => void;
  onChangeNaReason: (v: string) => void;
}) {
  const required =
    state === "remarks_due" ||
    (isNotApplicable && naReason.trim().length === 0);
  return (
    <div className="grid grid-cols-[1fr_auto] gap-2 border-t border-[color:var(--border)] py-2">
      <div
        className={
          required ? "border-l-2 border-[color:var(--warning)] pl-2" : "pl-2"
        }
      >
        <span className="text-[12.5px] text-[color:var(--muted-foreground)]">
          {isNotApplicable
            ? "Reason · required"
            : required
              ? "Remarks · required below Largely"
              : "Remarks · optional"}
        </span>
        <Textarea
          maxLength={2000}
          disabled={disabled}
          value={isNotApplicable ? naReason : remarks}
          onChange={(e) =>
            isNotApplicable
              ? onChangeNaReason(e.target.value)
              : onChangeRemarks(e.target.value)
          }
          aria-label={isNotApplicable ? "Not applicable reason" : "Remarks"}
        />
        {isNotApplicable && (
          <span className="text-[12.5px] text-[color:var(--muted-foreground)]">
            Excluded from the denominator
          </span>
        )}
      </div>
      {scoreEffect && (
        <span className="self-start text-[12.5px] text-[color:var(--muted-foreground)]">
          {scoreEffect}
        </span>
      )}
    </div>
  );
}
