"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Loader2 } from "@/lib/icons";
import { addModuleSelectionAction } from "@/actions/rbia/examination";

// ─── Types ───────────────────────────────────────────────────────────────────

type AllModuleRow = { id: string; code: string; name: string };

interface AddModuleDialogProps {
  engagementId: string;
  allModules: AllModuleRow[];
  currentSelectionNodeIds: Set<string>; // Set of moduleNodeId already selected
  disabled?: boolean; // When status-gated or frozen
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AddModuleDialog({
  engagementId,
  allModules,
  currentSelectionNodeIds,
  disabled,
}: AddModuleDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  // Per-module checkbox + reason state
  const initialCheckState = useMemo(
    () =>
      Object.fromEntries(
        allModules.map((m) => [
          m.id,
          {
            checked: currentSelectionNodeIds.has(m.id),
            reason: "",
          },
        ]),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allModules], // Re-initialize only when allModules changes, not on every render
  );

  const [checkState, setCheckState] =
    useState<Record<string, { checked: boolean; reason: string }>>(
      initialCheckState,
    );

  // Modules that were checked in this dialog session (not already selected)
  const newlyCheckedModules = useMemo(
    () =>
      allModules.filter(
        (m) => checkState[m.id]?.checked && !currentSelectionNodeIds.has(m.id),
      ),
    [allModules, checkState, currentSelectionNodeIds],
  );

  // Save is enabled when there's at least one newly checked module with a reason
  const saveEnabled =
    newlyCheckedModules.length > 0 &&
    newlyCheckedModules.every(
      (m) => (checkState[m.id]?.reason ?? "").trim().length > 0,
    );

  function handleCheckChange(moduleId: string, checked: boolean) {
    setCheckState((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], checked },
    }));
  }

  function handleReasonChange(moduleId: string, reason: string) {
    setCheckState((prev) => ({
      ...prev,
      [moduleId]: { ...prev[moduleId], reason },
    }));
  }

  function handleOpenChange(newOpen: boolean) {
    if (!newOpen) {
      // Reset to initial state on close
      setCheckState(initialCheckState);
    }
    setOpen(newOpen);
  }

  function handleSave() {
    startTransition(async () => {
      const results = await Promise.all(
        newlyCheckedModules.map((m) =>
          addModuleSelectionAction({
            engagementId,
            moduleNodeId: m.id,
            reason: (checkState[m.id]?.reason ?? "").trim(),
          }),
        ),
      );

      const successes = results.filter((r) => r.success).length;
      const failures = results.length - successes;

      if (failures === 0) {
        toast.success(
          successes === 1
            ? "Module added to examination."
            : `${successes} modules added to examination.`,
        );
        setOpen(false);
        router.refresh();
      } else if (successes > 0) {
        toast.error(
          `${successes} module(s) added, but ${failures} failed. Please try again.`,
        );
        router.refresh();
      } else {
        const firstError = results.find((r) => !r.success);
        toast.error(
          !firstError || firstError.success
            ? "Failed to add modules."
            : (firstError.error ?? "Failed to add modules."),
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Add Module
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Examination Modules</DialogTitle>
          <DialogDescription>
            Select modules to add to this examination. A reason is required for
            each.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[400px] pr-4">
          <div className="space-y-4 py-2">
            {allModules.map((m) => {
              const isAlreadySelected = currentSelectionNodeIds.has(m.id);
              const isChecked = checkState[m.id]?.checked ?? false;
              const isNewlyChecked = isChecked && !isAlreadySelected;
              const reason = checkState[m.id]?.reason ?? "";

              return (
                <div key={m.id} className="space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`module-${m.id}`}
                      checked={isChecked}
                      disabled={isAlreadySelected || isPending}
                      onCheckedChange={(checked) =>
                        handleCheckChange(m.id, checked === true)
                      }
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <Label
                        htmlFor={`module-${m.id}`}
                        className={
                          isAlreadySelected
                            ? "text-muted-foreground cursor-default"
                            : "cursor-pointer"
                        }
                      >
                        {m.name}
                        {isAlreadySelected && (
                          <span className="text-muted-foreground ml-2 text-xs font-normal">
                            (already selected)
                          </span>
                        )}
                      </Label>
                    </div>
                  </div>

                  {/* Inline reason field for newly checked modules */}
                  {isNewlyChecked && (
                    <div className="ml-6 space-y-1.5">
                      <Label
                        htmlFor={`reason-${m.id}`}
                        className="text-muted-foreground text-xs"
                      >
                        Reason for adding this module
                      </Label>
                      <Textarea
                        id={`reason-${m.id}`}
                        rows={2}
                        placeholder="Reason for adding this module..."
                        value={reason}
                        disabled={isPending}
                        onChange={(e) =>
                          handleReasonChange(m.id, e.target.value)
                        }
                        className="text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}

            {allModules.length === 0 && (
              <p className="text-muted-foreground py-4 text-center text-sm">
                No modules available.
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!saveEnabled || isPending}
            className="gap-1.5"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
