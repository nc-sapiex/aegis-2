"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, X } from "@/lib/icons";
import {
  createActionPoint,
  updateActionPoint,
  promoteToObservation,
} from "@/actions/rbia/findings";
import type {
  ActionPointData,
  ObservationData,
} from "@/data-access/rbia-findings";

// ─── Schemas ────────────────────────────────────────────────────────────────

const ActionPointFormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  moduleCode: z.string().min(1, "Module code is required"),
});

type ActionPointFormValues = z.infer<typeof ActionPointFormSchema>;

const ObservationFormSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters"),
  recommendation: z
    .preprocess(
      (v) => {
        if (typeof v !== "string") return v;
        const trimmed = v.trim();
        return trimmed === "" ? undefined : trimmed;
      },
      z.string().min(10, "Recommendation must be at least 10 characters").optional(),
    ),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  pertainsTo: z.enum(["FINANCE", "OPERATIONS", "LEGAL_RECOVERY", "HR", "IT"]),
});

type ObservationFormValues = z.infer<typeof ObservationFormSchema>;

// ─── Props ──────────────────────────────────────────────────────────────────

interface FindingFormProps {
  engagementId: string;
  branchId: string;
  mode: "create-ap" | "create-observation" | "edit-ap" | "promote";
  existingData?: ActionPointData | ObservationData | null;
  sourceActionPointId?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

// ─── Severity Options ───────────────────────────────────────────────────────

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" },
] as const;

// ─── Mode Title Map ─────────────────────────────────────────────────────────

const MODE_TITLES: Record<FindingFormProps["mode"], string> = {
  "create-ap": "New Action Point",
  "create-observation": "New Observation",
  "edit-ap": "Edit Action Point",
  promote: "Promote to Observation",
};

// ─── Component ──────────────────────────────────────────────────────────────

export function FindingForm({
  engagementId,
  branchId,
  mode,
  existingData,
  sourceActionPointId,
  onCancel,
  onSuccess,
}: FindingFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const isObservationMode = mode === "create-observation" || mode === "promote";

  // ─── AP Form ────────────────────────────────────────────────────────────

  const apForm = useForm<ActionPointFormValues>({
    resolver: zodResolver(ActionPointFormSchema as any),
    defaultValues:
      mode === "edit-ap" && existingData && "serialNo" in existingData
        ? {
            title: existingData.title,
            description: existingData.description,
            severity: existingData.severity,
            moduleCode: existingData.moduleCode,
          }
        : {
            title: "",
            description: "",
            severity: "MEDIUM",
            moduleCode: "",
          },
  });

  // ─── Observation / Promote Form ─────────────────────────────────────────

  const obsForm = useForm<ObservationFormValues>({
    resolver: zodResolver(ObservationFormSchema as any),
    defaultValues:
      mode === "promote" && existingData && "serialNo" in existingData
        ? {
            title: existingData.title,
            description: existingData.description,
            recommendation: "",
            severity: existingData.severity,
            pertainsTo: "OPERATIONS",
          }
        : mode === "create-observation" &&
            existingData &&
            !("serialNo" in existingData)
          ? {
              title: existingData.title,
              description: existingData.description,
              recommendation: existingData.recommendation ?? "",
              severity: existingData.severity,
              pertainsTo: existingData.pertainsTo,
            }
          : {
              title: "",
              description: "",
              recommendation: "",
              severity: "MEDIUM",
              pertainsTo: "OPERATIONS",
            },
  });

  // ─── Submit Handlers ────────────────────────────────────────────────────

  function handleApSubmit(values: ActionPointFormValues) {
    startTransition(async () => {
      try {
        if (mode === "edit-ap" && existingData && "serialNo" in existingData) {
          const result = await updateActionPoint({
            actionPointId: existingData.id,
            title: values.title,
            description: values.description,
            severity: values.severity,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("Action Point updated");
        } else {
          const result = await createActionPoint({
            engagementId,
            branchId,
            title: values.title,
            description: values.description,
            severity: values.severity,
            moduleCode: values.moduleCode,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success(`Action Point AP-${result.data.serialNo} created`);
        }
        router.refresh();
        onSuccess();
      } catch {
        toast.error("An unexpected error occurred");
      }
    });
  }

  function handleObsSubmit(values: ObservationFormValues) {
    startTransition(async () => {
      try {
        if (mode === "promote" && sourceActionPointId) {
          const result = await promoteToObservation({
            actionPointId: sourceActionPointId,
            title: values.title,
            description: values.description,
            recommendation: values.recommendation,
            severity: values.severity,
            pertainsTo: values.pertainsTo,
          });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("Promoted to Observation");
        } else {
          // Direct observation creation would use a different action
          // For now, promote is the only observation creation path from findings
          toast.error("Direct observation creation not yet available");
          return;
        }
        router.refresh();
        onSuccess();
      } catch {
        toast.error("An unexpected error occurred");
      }
    });
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <Card className="border-dashed border-blue-300 bg-blue-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{MODE_TITLES[mode]}</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={onCancel}
            className="h-7 w-7"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Cancel</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isObservationMode ? (
          <form
            onSubmit={obsForm.handleSubmit(handleObsSubmit)}
            className="space-y-4"
          >
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="obs-title">Title</Label>
              <Input
                id="obs-title"
                placeholder="Observation title"
                {...obsForm.register("title")}
              />
              {obsForm.formState.errors.title && (
                <p className="text-xs text-red-600">
                  {obsForm.formState.errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs-description">Description</Label>
              <Textarea
                id="obs-description"
                placeholder="Describe the finding..."
                rows={4}
                {...obsForm.register("description")}
              />
              {obsForm.formState.errors.description && (
                <p className="text-xs text-red-600">
                  {obsForm.formState.errors.description.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs-recommendation">Recommendation</Label>
              <Textarea
                id="obs-recommendation"
                placeholder="Recommended corrective action..."
                rows={3}
                {...obsForm.register("recommendation")}
              />
              {obsForm.formState.errors.recommendation && (
                <p className="text-xs text-red-600">
                  {obsForm.formState.errors.recommendation.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="obs-pertains-to">Pertains to</Label>
              <Select
                value={obsForm.watch("pertainsTo")}
                onValueChange={(v) =>
                  obsForm.setValue(
                    "pertainsTo",
                    v as ObservationFormValues["pertainsTo"],
                  )
                }
              >
                <SelectTrigger id="obs-pertains-to" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FINANCE">Finance</SelectItem>
                  <SelectItem value="OPERATIONS">Operations</SelectItem>
                  <SelectItem value="LEGAL_RECOVERY">Legal Recovery</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="IT">IT</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Severity */}
            <div className="space-y-1.5">
              <Label>Severity</Label>
              <Select
                value={obsForm.watch("severity")}
                onValueChange={(v) =>
                  obsForm.setValue(
                    "severity",
                    v as ObservationFormValues["severity"],
                  )
                }
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {mode === "promote"
                  ? "Promote to Observation"
                  : "Create Observation"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <form
            onSubmit={apForm.handleSubmit(handleApSubmit)}
            className="space-y-4"
          >
            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="ap-title">Title</Label>
              <Input
                id="ap-title"
                placeholder="Action Point title"
                {...apForm.register("title")}
              />
              {apForm.formState.errors.title && (
                <p className="text-xs text-red-600">
                  {apForm.formState.errors.title.message}
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="ap-description">Description</Label>
              <Textarea
                id="ap-description"
                placeholder="Describe the finding..."
                rows={3}
                {...apForm.register("description")}
              />
              {apForm.formState.errors.description && (
                <p className="text-xs text-red-600">
                  {apForm.formState.errors.description.message}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-start gap-4">
              {/* Severity */}
              <div className="space-y-1.5">
                <Label>Severity</Label>
                <Select
                  value={apForm.watch("severity")}
                  onValueChange={(v) =>
                    apForm.setValue(
                      "severity",
                      v as ActionPointFormValues["severity"],
                    )
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Module Code */}
              {mode !== "edit-ap" && (
                <div className="space-y-1.5">
                  <Label htmlFor="ap-module">Module Code</Label>
                  <Input
                    id="ap-module"
                    placeholder="e.g. OPS, CRD"
                    className="w-40"
                    {...apForm.register("moduleCode")}
                  />
                  {apForm.formState.errors.moduleCode && (
                    <p className="text-xs text-red-600">
                      {apForm.formState.errors.moduleCode.message}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              <Button type="submit" size="sm" disabled={isPending}>
                {isPending && (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                )}
                {mode === "edit-ap" ? "Save Changes" : "Create Action Point"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onCancel}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
