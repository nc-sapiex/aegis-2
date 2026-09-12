"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "@/lib/icons";
import { confirmRepeatFinding } from "@/actions/repeat-findings/confirm";
import { dismissRepeatFinding } from "@/actions/repeat-findings/confirm";
import type { RepeatCandidate } from "@/actions/repeat-findings/detect";
import { SEVERITY_COLORS } from "@/lib/constants";
import { SeverityBadge } from "@/components/ui/severity-badge";

interface RepeatFindingBannerProps {
  candidates: RepeatCandidate[];
  observationId: string;
  observationVersion: number;
  onDismiss: (dismissedId: string) => void;
}

export function RepeatFindingBanner({
  candidates,
  observationId,
  observationVersion,
  onDismiss,
}: RepeatFindingBannerProps) {
  const [isPending, startTransition] = useTransition();

  if (candidates.length === 0) return null;

  const handleConfirm = (repeatOfId: string) => {
    startTransition(async () => {
      const result = await confirmRepeatFinding({
        observationId,
        repeatOfId,
        version: observationVersion,
      });

      if (result.success) {
        const msg = result.data.wasEscalated
          ? `Repeat confirmed. Severity escalated to ${result.data.escalatedSeverity}.`
          : "Repeat confirmed. No severity change needed.";
        toast.success(msg);
        onDismiss(repeatOfId);
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDismiss = (repeatOfId: string) => {
    startTransition(async () => {
      const result = await dismissRepeatFinding({
        observationId,
        repeatOfId,
      });

      if (result.success) {
        toast.info("Repeat suggestion dismissed.");
        onDismiss(repeatOfId);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Card className="border-amber-200 bg-amber-50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-amber-800">
          <AlertTriangle className="h-4 w-4" />
          Potential Repeat Finding Detected
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {candidates.slice(0, 3).map((candidate) => {
          const severityKey =
            candidate.severity.toLowerCase() as keyof typeof SEVERITY_COLORS;
          return (
            <div
              key={candidate.id}
              className="flex flex-col gap-2 rounded-md border border-amber-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{candidate.title}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={candidate.severity} />
                  <span className="text-muted-foreground text-xs">
                    {Math.round(candidate.similarity * 100)}% match
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {candidate.occurrenceCount} prior occurrence
                    {candidate.occurrenceCount !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleConfirm(candidate.id)}
                  disabled={isPending}
                >
                  Confirm as Repeat
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDismiss(candidate.id)}
                  disabled={isPending}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
