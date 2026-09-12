"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Ban } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EngagementStepperProps {
  currentStatus: string; // EngagementStatus enum value
  openingMeetingRecorded: boolean;
  exitMeetingRecorded: boolean;
}

// ─── Stage Definitions (7 linear stages, CANCELLED excluded) ────────────────

const STAGES = [
  { key: "PLANNED", label: "Planned", shortLabel: "Plan" },
  { key: "TEAM_ASSIGNED", label: "Team Assigned", shortLabel: "Team" },
  { key: "OPENING_MEETING", label: "Opening Meeting", shortLabel: "Open" },
  { key: "IN_PROGRESS", label: "In Progress", shortLabel: "WIP" },
  { key: "EXIT_MEETING", label: "Exit Meeting", shortLabel: "Exit" },
  { key: "REPORT_DRAFT", label: "Report Draft", shortLabel: "Draft" },
  { key: "COMPLETED", label: "Completed", shortLabel: "Done" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];

// ─── Helper: resolve stage state ────────────────────────────────────────────

type StageState = "completed" | "active" | "future";

function resolveStageStates(
  currentStatus: string,
  openingMeetingRecorded: boolean,
  exitMeetingRecorded: boolean,
): Record<StageKey, StageState> {
  const stageIndex = STAGES.findIndex((s) => s.key === currentStatus);
  // If status is CANCELLED or unknown, default to index -1 (all future)
  const currentIdx = stageIndex === -1 ? -1 : stageIndex;

  const states = {} as Record<StageKey, StageState>;

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    if (i < currentIdx) {
      states[stage.key] = "completed";
    } else if (i === currentIdx) {
      states[stage.key] = "active";
    } else {
      states[stage.key] = "future";
    }
  }

  // Per user decision: Opening Meeting and Exit Meeting show green checkmarks
  // once recorded, regardless of linear position
  if (openingMeetingRecorded && states["OPENING_MEETING"] !== "future") {
    states["OPENING_MEETING"] = "completed";
  }
  if (exitMeetingRecorded && states["EXIT_MEETING"] !== "future") {
    states["EXIT_MEETING"] = "completed";
  }

  return states;
}

// ─── Stepper Node ───────────────────────────────────────────────────────────

function StepNode({
  label,
  shortLabel,
  state,
}: {
  label: string;
  shortLabel: string;
  state: StageState;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {/* Circle indicator */}
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full transition-all",
          state === "completed" && "bg-green-500 text-white",
          state === "active" && "bg-blue-600 text-white ring-4 ring-blue-200",
          state === "future" && "bg-gray-200 text-gray-400",
        )}
      >
        {state === "completed" ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : state === "active" ? (
          <Circle className="h-4 w-4 fill-current" />
        ) : (
          <Circle className="h-4 w-4" />
        )}
      </div>

      {/* Label — full on md+, abbreviated on mobile */}
      <span
        className={cn(
          "text-center text-xs leading-tight",
          state === "completed" && "font-medium text-green-700",
          state === "active" && "font-medium text-blue-700",
          state === "future" && "text-muted-foreground",
        )}
      >
        <span className="hidden md:inline">{label}</span>
        <span className="md:hidden">{shortLabel}</span>
      </span>
    </div>
  );
}

// ─── Connecting Line ────────────────────────────────────────────────────────

function ConnectingLine({ completed }: { completed: boolean }) {
  return (
    <div
      className={cn(
        "mt-4 h-0.5 flex-1 transition-colors",
        completed ? "bg-green-500" : "bg-gray-200",
      )}
    />
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function EngagementStepper({
  currentStatus,
  openingMeetingRecorded,
  exitMeetingRecorded,
}: EngagementStepperProps) {
  const isCancelled = currentStatus === "CANCELLED";
  const stageStates = resolveStageStates(
    currentStatus,
    openingMeetingRecorded,
    exitMeetingRecorded,
  );

  return (
    <div className="relative w-full">
      {/* Cancelled overlay */}
      {isCancelled && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Badge
            variant="destructive"
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold shadow-lg"
          >
            <Ban className="h-4 w-4" />
            Cancelled
          </Badge>
        </div>
      )}

      {/* Stepper */}
      <div
        className={cn("flex w-full items-start", isCancelled && "opacity-40")}
      >
        {STAGES.map((stage, index) => (
          <React.Fragment key={stage.key}>
            <StepNode
              label={stage.label}
              shortLabel={stage.shortLabel}
              state={stageStates[stage.key]}
            />
            {/* Connecting line between nodes (not after last) */}
            {index < STAGES.length - 1 && (
              <ConnectingLine
                completed={
                  stageStates[stage.key] === "completed" &&
                  stageStates[STAGES[index + 1].key] !== "future"
                }
              />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
