"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "@/lib/icons";
import { removeModuleSelectionAction } from "@/actions/rbia/examination";
import type { ModuleSelectionRow } from "./rbia-module-grid";

// ─── Props ───────────────────────────────────────────────────────────────────

interface RemoveModuleAlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: ModuleSelectionRow | null;
  engagementId: string;
  hasScoredItems: boolean; // true if module's scoredCount > 0
}

// ─── Component ───────────────────────────────────────────────────────────────

export function RemoveModuleAlertDialog({
  open,
  onOpenChange,
  module,
  engagementId,
  hasScoredItems,
}: RemoveModuleAlertDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  const isAutoSelected = module?.isAutoSelected ?? false;
  const canRemove = !hasScoredItems && reason.trim().length > 0;

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      setReason("");
    }
    onOpenChange(newOpen);
  }

  function handleRemove() {
    if (!module || !canRemove) return;

    startTransition(async () => {
      const result = await removeModuleSelectionAction({
        engagementId,
        moduleNodeId: module.moduleNodeId,
        reason: reason.trim(),
      });

      if (result.success) {
        toast.success(`"${module.moduleNode.name}" removed from examination.`);
        handleOpenChange(false);
        router.refresh();
      } else {
        toast.error(
          result.success === false
            ? (result.error ?? "Failed to remove module.")
            : "Failed to remove module.",
        );
      }
    });
  }

  if (!module) return null;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove Module</AlertDialogTitle>
          <AlertDialogDescription>
            {isAutoSelected
              ? `"${module.moduleNode.name}" was automatically selected based on branch risk profile. Removing a risk-selected module requires documented justification.`
              : `Remove "${module.moduleNode.name}" from this examination?`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Scored-items warning — blocks removal */}
        {hasScoredItems && (
          <div className="border-destructive bg-destructive/10 flex items-start gap-3 rounded-md border p-3">
            <AlertTriangle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-destructive text-sm">
              This module has scored items. Clear all scores before removing.
            </p>
          </div>
        )}

        {/* Reason textarea — only shown when removal is possible */}
        {!hasScoredItems && (
          <div className="space-y-1.5">
            <Label htmlFor="removal-reason">Reason for removal</Label>
            <Textarea
              id="removal-reason"
              rows={3}
              placeholder="Explain why this module is being removed..."
              value={reason}
              disabled={isPending}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!canRemove || isPending}
            onClick={handleRemove}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {hasScoredItems ? "Cannot Remove" : "Remove Module"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
