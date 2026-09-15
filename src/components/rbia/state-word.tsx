import { cn } from "@/lib/utils";
import type { StatementState } from "@/lib/statement-state";

const COPY: Record<StatementState, string> = {
  unscored: "Unscored",
  remarks_due: "Remarks due",
  scored: "Scored",
  non_compliant: "Non-compliant",
  not_applicable: "Not applicable",
  not_saved: "Not saved · Retry",
};

const COLOR: Record<StatementState, string> = {
  unscored: "text-[color:var(--muted-foreground)]",
  remarks_due: "text-[color:var(--warning)]",
  scored: "text-[color:var(--success)]",
  non_compliant: "text-[color:var(--destructive)]",
  not_applicable: "text-[color:var(--muted-foreground)]",
  not_saved: "text-[color:var(--destructive)]",
};

export function StateWord({
  state,
  revisedBy,
  scoredBy,
}: {
  state: StatementState;
  revisedBy?: string;
  scoredBy?: string;
}) {
  const text = revisedBy
    ? `Revised by ${revisedBy}`
    : scoredBy
      ? `Scored by ${scoredBy}`
      : COPY[state];
  return (
    <span
      aria-live="polite"
      className={cn("text-[11px] tracking-wide uppercase", COLOR[state])}
    >
      {text}
    </span>
  );
}
