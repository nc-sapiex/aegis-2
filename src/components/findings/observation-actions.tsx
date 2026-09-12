"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "@/lib/icons";
import {
  getAvailableTransitions,
  type ObservationStatus,
  type Role,
  type Severity,
  type AvailableTransition,
} from "@/lib/state-machine";
import { hasPermission } from "@/lib/permissions";
import { transitionObservation } from "@/actions/observations/transition";
import { resolveFieldwork } from "@/actions/observations/resolve-fieldwork";

interface ObservationActionsProps {
  observation: {
    id: string;
    status: string;
    severity: string;
    version: number;
    resolvedDuringFieldwork?: boolean;
  };
  userRoles: string[];
}

function isReturnTransition(
  currentStatus: string,
  targetStatus: string,
): boolean {
  // Return transitions go backwards: SUBMITTED→DRAFT, REVIEWED→SUBMITTED
  const statusOrder = [
    "DRAFT",
    "SUBMITTED",
    "REVIEWED",
    "ISSUED",
    "RESPONSE",
    "COMPLIANCE",
    "CLOSED",
  ];
  const fromIdx = statusOrder.indexOf(currentStatus);
  const toIdx = statusOrder.indexOf(targetStatus);
  return toIdx < fromIdx;
}

export function ObservationActions({
  observation,
  userRoles,
}: ObservationActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [selectedTransition, setSelectedTransition] =
    useState<AvailableTransition | null>(null);
  const [comment, setComment] = useState("");
  const [auditeeResponse, setAuditeeResponse] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [resolutionReason, setResolutionReason] = useState("");

  const transitions = getAvailableTransitions(
    observation.status as ObservationStatus,
    userRoles as Role[],
    observation.severity as Severity,
  );

  // Mirror the resolveFieldwork server action's gate exactly (it authorises on
  // observation:create OR observation:review). Hardcoding AUDITOR/AUDIT_MANAGER
  // here hid the button from the other author roles (Lead/Field/Concurrent/IS
  // auditor) even though the server would have accepted them.
  const canResolveFieldwork =
    !observation.resolvedDuringFieldwork &&
    (observation.status === "DRAFT" || observation.status === "SUBMITTED") &&
    (hasPermission(userRoles as Role[], "observation:create") ||
      hasPermission(userRoles as Role[], "observation:review"));

  // No actions available
  if (transitions.length === 0 && !canResolveFieldwork) {
    return null;
  }

  function handleTransitionClick(transition: AvailableTransition) {
    setSelectedTransition(transition);
    setComment("");
    setAuditeeResponse("");
    setActionPlan("");
    setDialogOpen(true);
  }

  function handleConfirmTransition() {
    if (!selectedTransition || comment.length < 1) return;

    startTransition(async () => {
      const result = await transitionObservation({
        observationId: observation.id,
        targetStatus: selectedTransition.to,
        comment,
        version: observation.version,
        ...(selectedTransition.to === "RESPONSE"
          ? {
              auditeeResponse: auditeeResponse || undefined,
              actionPlan: actionPlan || undefined,
            }
          : {}),
      });

      if (result.success) {
        toast.success(`Observation ${selectedTransition.label.toLowerCase()}`);
        setDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleResolveFieldwork() {
    if (resolutionReason.length < 10) return;

    startTransition(async () => {
      const result = await resolveFieldwork({
        observationId: observation.id,
        resolutionReason,
        version: observation.version,
      });

      if (result.success) {
        toast.success("Observation resolved during fieldwork");
        setResolveDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  const isResponseTransition = selectedTransition?.to === "RESPONSE";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {transitions.map((transition) => {
          const isReturn = isReturnTransition(
            observation.status,
            transition.to,
          );
          return (
            <Button
              key={transition.to}
              variant={isReturn ? "outline" : "default"}
              size="sm"
              disabled={isPending}
              onClick={() => handleTransitionClick(transition)}
            >
              {transition.label}
            </Button>
          );
        })}

        {canResolveFieldwork && (
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
            onClick={() => {
              setResolutionReason("");
              setResolveDialogOpen(true);
            }}
          >
            Resolve During Fieldwork
          </Button>
        )}
      </div>

      {/* Transition dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Confirm: {selectedTransition?.label ?? "Transition"}
            </DialogTitle>
            <DialogDescription>
              Provide a comment for this state transition. This will be recorded
              in the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label
                htmlFor="transition-comment"
                className="text-sm font-medium"
              >
                Comment <span className="text-red-500">*</span>
              </label>
              <Textarea
                id="transition-comment"
                placeholder="Reason for this transition..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
              />
            </div>

            {isResponseTransition && (
              <>
                <div className="space-y-2">
                  <label
                    htmlFor="auditee-response"
                    className="text-sm font-medium"
                  >
                    Auditee Response
                  </label>
                  <Textarea
                    id="auditee-response"
                    placeholder="Enter auditee's response..."
                    value={auditeeResponse}
                    onChange={(e) => setAuditeeResponse(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="action-plan" className="text-sm font-medium">
                    Action Plan
                  </label>
                  <Textarea
                    id="action-plan"
                    placeholder="Enter corrective action plan..."
                    value={actionPlan}
                    onChange={(e) => setActionPlan(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmTransition}
              disabled={isPending || comment.length < 1}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve during fieldwork dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve During Fieldwork</DialogTitle>
            <DialogDescription>
              Mark this observation as resolved during fieldwork. Provide a
              detailed reason for the resolution.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor="resolution-reason" className="text-sm font-medium">
              Resolution Reason <span className="text-red-500">*</span>
              <span className="text-muted-foreground ml-1 text-xs">
                (min 10 characters)
              </span>
            </label>
            <Textarea
              id="resolution-reason"
              placeholder="Explain why this observation is being resolved during fieldwork..."
              value={resolutionReason}
              onChange={(e) => setResolutionReason(e.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResolveDialogOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleResolveFieldwork}
              disabled={isPending || resolutionReason.length < 10}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
