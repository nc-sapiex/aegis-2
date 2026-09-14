"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useActionState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Separator } from "@/components/ui/separator";
import { createObservation } from "@/actions/observations/create";
import { detectRepeatFindings } from "@/actions/repeat-findings/detect";
import type { RepeatCandidate } from "@/actions/repeat-findings/detect";
import { RepeatFindingBanner } from "./repeat-finding-banner";
import { RISK_CATEGORIES } from "@/lib/constants";

interface ObservationFormProps {
  branches: { id: string; name: string }[];
  auditAreas: { id: string; name: string }[];
  modules: { id: string; code: string; name: string }[];
}

const PERTAINS_TO_OPTIONS = [
  { value: "FINANCE", label: "Finance" },
  { value: "OPERATIONS", label: "Operations" },
  { value: "LEGAL_RECOVERY", label: "Legal / Recovery" },
  { value: "HR", label: "HR" },
  { value: "IT", label: "IT" },
] as const;

type FormState = {
  success?: boolean;
  error?: string;
  data?: { id: string };
};

async function submitAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = {
    title: formData.get("title") as string,
    description: formData.get("description") as string,
    recommendation: formData.get("recommendation") as string,
    severity: formData.get("severity") as
      "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    pertainsTo: formData.get("pertainsTo") as
      "FINANCE" | "OPERATIONS" | "LEGAL_RECOVERY" | "HR" | "IT",
    moduleId: formData.get("moduleId") as string,
    branchId: (formData.get("branchId") as string) || undefined,
    auditAreaId: (formData.get("auditAreaId") as string) || undefined,
    riskCategory: (formData.get("riskCategory") as string) || undefined,
    dueDate: (formData.get("dueDate") as string) || undefined,
  };

  return createObservation(input);
}

export function ObservationForm({
  branches,
  auditAreas,
  modules,
}: ObservationFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(submitAction, {});
  const [repeatCandidates, setRepeatCandidates] = React.useState<
    RepeatCandidate[]
  >([]);
  const [, startTransition] = useTransition();

  // Track form values for repeat detection
  const [title, setTitle] = React.useState("");
  const [branchId, setBranchId] = React.useState("");
  const [auditAreaId, setAuditAreaId] = React.useState("");
  const [observationId, setObservationId] = React.useState<string | null>(null);

  // Debounced repeat finding detection
  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    if (!title || title.length < 5 || !branchId || !auditAreaId) {
      setRepeatCandidates([]);
      return;
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await detectRepeatFindings({
          title,
          branchId,
          auditAreaId,
        });
        if (result.success) {
          setRepeatCandidates(result.data.candidates);
        }
      });
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [title, branchId, auditAreaId, startTransition]);

  // Handle successful creation
  React.useEffect(() => {
    if (state.success && state.data?.id) {
      toast.success("Observation created successfully");
      setObservationId(state.data.id);
      router.push(`/findings/${state.data.id}`);
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction}>
      {repeatCandidates.length > 0 && observationId && (
        <div className="mb-6">
          <RepeatFindingBanner
            candidates={repeatCandidates}
            observationId={observationId}
            observationVersion={1}
            onDismiss={(dismissedId: string) => {
              setRepeatCandidates((prev) =>
                prev.filter((c) => c.id !== dismissedId),
              );
            }}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main form — 5C fields */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Observation Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="Brief title describing the observation"
                  required
                  minLength={5}
                  maxLength={200}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Describe the finding: what was found, what was expected, why it happened, and its impact..."
                  required
                  minLength={10}
                  rows={6}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="recommendation">
                  Recommendation — Suggested corrective action *
                </Label>
                <Textarea
                  id="recommendation"
                  name="recommendation"
                  placeholder="Recommended corrective action to address the finding..."
                  required
                  minLength={10}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar — metadata fields */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Classification</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="severity">Severity *</Label>
                <Select name="severity" required defaultValue="MEDIUM">
                  <SelectTrigger id="severity">
                    <SelectValue placeholder="Select severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="moduleId">Module *</Label>
                <Select name="moduleId" required>
                  <SelectTrigger id="moduleId">
                    <SelectValue placeholder="Select module" />
                  </SelectTrigger>
                  <SelectContent>
                    {modules.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.code} — {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pertainsTo">Pertains To *</Label>
                <Select name="pertainsTo" required>
                  <SelectTrigger id="pertainsTo">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {PERTAINS_TO_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="branchId">Branch</Label>
                <Select
                  name="branchId"
                  value={branchId}
                  onValueChange={setBranchId}
                >
                  <SelectTrigger id="branchId">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="auditAreaId">Audit Area</Label>
                <Select
                  name="auditAreaId"
                  value={auditAreaId}
                  onValueChange={setAuditAreaId}
                >
                  <SelectTrigger id="auditAreaId">
                    <SelectValue placeholder="Select audit area" />
                  </SelectTrigger>
                  <SelectContent>
                    {auditAreas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="riskCategory">Risk Category</Label>
                <Select name="riskCategory">
                  <SelectTrigger id="riskCategory">
                    <SelectValue placeholder="Select risk category" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" name="dueDate" type="date" />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Creating..." : "Create Observation"}
          </Button>
        </div>
      </div>
    </form>
  );
}
