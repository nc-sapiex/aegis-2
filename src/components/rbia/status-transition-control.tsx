"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2 } from "@/lib/icons";
import { transitionEngagementStatus } from "@/actions/audit-execution/transition-engagement-status";

// ---- Props -------------------------------------------------------------------

interface StatusTransitionControlProps {
  currentStatus: string;
  nextStatus: string;
  label: string;
  engagementId: string;
  canTransition: boolean;
  prerequisiteMet: boolean;
  prerequisiteMessage?: string;
}

// ---- Component ---------------------------------------------------------------

/**
 * Engagement status transition button with conditional disabled state and tooltip.
 *
 * Per CONTEXT.md locked decision: "Tooltip on disabled transition button --
 * hover shows 'Record opening meeting first' or 'Record exit meeting first'".
 *
 * - If user lacks permission: don't render at all
 * - If prerequisite not met: render disabled button with tooltip
 * - If prerequisite met: render enabled button that triggers the transition
 */
export function StatusTransitionControl({
  currentStatus,
  nextStatus,
  label,
  engagementId,
  canTransition,
  prerequisiteMet,
  prerequisiteMessage,
}: StatusTransitionControlProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Don't render if user lacks permission
  if (!canTransition) return null;

  // Terminal states have no next status
  if (!nextStatus) return null;

  const handleTransition = () => {
    startTransition(async () => {
      const result = await transitionEngagementStatus({
        engagementId,
        targetStatus: nextStatus as any,
      });

      if (result.success) {
        toast.success(
          `Status updated to ${nextStatus.replace(/_/g, " ").toLowerCase()}`,
        );
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  // Prerequisite NOT met -- disabled button with tooltip
  if (!prerequisiteMet) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button
                variant="default"
                size="sm"
                disabled
                className="cursor-not-allowed opacity-50"
              >
                {label}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {prerequisiteMessage ?? "Prerequisite not met"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Prerequisite met -- enabled transition button
  return (
    <Button
      variant="default"
      size="sm"
      onClick={handleTransition}
      disabled={isPending}
    >
      {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {label}
    </Button>
  );
}
