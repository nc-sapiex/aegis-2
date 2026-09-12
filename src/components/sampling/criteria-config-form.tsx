"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Lock, Loader2, AlertTriangle, Save } from "@/lib/icons";
import { saveSamplingCriteria } from "@/actions/sampling/save-criteria";
import { generateSampleAction } from "@/actions/sampling/generate-sample";
import type { BucketAllocation, BucketName } from "@/lib/sampling-engine";
import type { RedistributionWarning } from "@/lib/sampling-engine";

// ─── Constants ────────────────────────────────────────────────────────────────

const BUCKET_DEFAULTS: {
  bucket: BucketName;
  label: string;
  description: string;
}[] = [
  {
    bucket: "NEWLY_SANCTIONED",
    label: "Newly Sanctioned",
    description: "Loans sanctioned within last 12 months",
  },
  {
    bucket: "AMOUNT_WISE",
    label: "Amount-wise",
    description: "Largest outstanding loan amounts",
  },
  {
    bucket: "AGE_WISE",
    label: "Age-wise",
    description: "Longest tenure loans (oldest sanction dates)",
  },
  {
    bucket: "DPD_WISE",
    label: "DPD-wise",
    description: "Highest days past due",
  },
  {
    bucket: "PRIOR_OBSERVATIONS",
    label: "Prior Observations",
    description: "Accounts flagged with prior audit observations",
  },
];

const DEFAULT_BUCKET_PCT = 20; // 20% each = 100% total

// ─── Types ────────────────────────────────────────────────────────────────────

interface CriteriaConfigFormProps {
  engagementId: string;
  moduleCode: string;
  existingConfig: {
    sampleSizePct: number;
    criteriaBuckets: BucketAllocation[];
    isLocked: boolean;
    sampleGenerated: boolean;
  } | null;
  portfolioCount: number;
  canEdit: boolean; // false for auditors (SMPL-03)
}

// ─── Read-Only View (Auditor) ─────────────────────────────────────────────────

function ReadOnlyView({
  config,
  portfolioCount,
}: {
  config: CriteriaConfigFormProps["existingConfig"];
  portfolioCount: number;
}) {
  if (!config) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-sm">
            Sampling criteria have not been configured yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalSampleCount = Math.round(
    (portfolioCount * config.sampleSizePct) / 100,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sampling Criteria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sample size display */}
        <div className="text-sm">
          <span className="text-muted-foreground">Overall Sample Size: </span>
          <span className="font-medium">
            {config.sampleSizePct}% of {portfolioCount} accounts ={" "}
            {totalSampleCount} accounts
          </span>
        </div>

        {/* Criteria table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Bucket</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Allocation</TableHead>
              <TableHead className="text-right">Accounts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {config.criteriaBuckets.map((b) => {
              const def = BUCKET_DEFAULTS.find((d) => d.bucket === b.bucket);
              return (
                <TableRow key={b.bucket}>
                  <TableCell className="font-medium">
                    {def?.label ?? b.bucket}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {b.description}
                  </TableCell>
                  <TableCell className="text-right">{b.pct}%</TableCell>
                  <TableCell className="text-right">
                    {Math.round((totalSampleCount * b.pct) / 100)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Editable Form (HIA) ──────────────────────────────────────────────────────

export function CriteriaConfigForm({
  engagementId,
  moduleCode,
  existingConfig,
  portfolioCount,
  canEdit,
}: CriteriaConfigFormProps) {
  // Auditor read-only path (SMPL-03)
  if (!canEdit) {
    return (
      <ReadOnlyView config={existingConfig} portfolioCount={portfolioCount} />
    );
  }

  return (
    <EditableForm
      engagementId={engagementId}
      moduleCode={moduleCode}
      existingConfig={existingConfig}
      portfolioCount={portfolioCount}
    />
  );
}

// ─── Internal Editable Form ───────────────────────────────────────────────────

function EditableForm({
  engagementId,
  moduleCode,
  existingConfig,
  portfolioCount,
}: Omit<CriteriaConfigFormProps, "canEdit">) {
  // Initialize bucket percentages from existing config or defaults
  const initialBuckets = (): Record<BucketName, number> => {
    if (existingConfig?.criteriaBuckets) {
      const map: Record<string, number> = {};
      for (const b of existingConfig.criteriaBuckets) {
        map[b.bucket] = b.pct;
      }
      return {
        NEWLY_SANCTIONED: map["NEWLY_SANCTIONED"] ?? DEFAULT_BUCKET_PCT,
        AMOUNT_WISE: map["AMOUNT_WISE"] ?? DEFAULT_BUCKET_PCT,
        AGE_WISE: map["AGE_WISE"] ?? DEFAULT_BUCKET_PCT,
        DPD_WISE: map["DPD_WISE"] ?? DEFAULT_BUCKET_PCT,
        PRIOR_OBSERVATIONS: map["PRIOR_OBSERVATIONS"] ?? DEFAULT_BUCKET_PCT,
      };
    }
    return {
      NEWLY_SANCTIONED: DEFAULT_BUCKET_PCT,
      AMOUNT_WISE: DEFAULT_BUCKET_PCT,
      AGE_WISE: DEFAULT_BUCKET_PCT,
      DPD_WISE: DEFAULT_BUCKET_PCT,
      PRIOR_OBSERVATIONS: DEFAULT_BUCKET_PCT,
    };
  };

  const [sampleSizePct, setSampleSizePct] = useState<number>(
    existingConfig?.sampleSizePct ?? 10,
  );
  const [bucketPcts, setBucketPcts] =
    useState<Record<BucketName, number>>(initialBuckets());
  const [isLocked, setIsLocked] = useState(
    existingConfig?.sampleGenerated ?? false,
  );
  const [savedConfig, setSavedConfig] = useState<boolean>(
    existingConfig !== null,
  );
  const [warnings, setWarnings] = useState<RedistributionWarning[]>([]);
  const [isSaving, startSave] = useTransition();
  const [isGenerating, startGenerate] = useTransition();

  // Derived calculations
  const totalSampleCount = Math.round((portfolioCount * sampleSizePct) / 100);
  const bucketSum = Object.values(bucketPcts).reduce((a, b) => a + b, 0);
  const isValid = Math.abs(bucketSum - 100) < 0.01;
  const isDisabled = isLocked || isSaving || isGenerating;

  // ─── Save handler ─────────────────────────────────────────────────────────

  function handleSave() {
    if (!isValid) return;

    const criteriaBuckets: BucketAllocation[] = BUCKET_DEFAULTS.map((def) => ({
      bucket: def.bucket,
      pct: bucketPcts[def.bucket],
      description: def.description,
    }));

    startSave(async () => {
      const result = await saveSamplingCriteria({
        engagementId,
        moduleCode,
        sampleSizePct,
        criteriaBuckets,
      });

      if (result.success) {
        setSavedConfig(true);
        toast.success("Sampling criteria saved successfully.");
      } else {
        toast.error(result.error ?? "Failed to save criteria.");
      }
    });
  }

  // ─── Generate handler ─────────────────────────────────────────────────────

  function handleGenerate() {
    const confirmed = window.confirm(
      `This will select ${totalSampleCount} accounts from the portfolio. Any previous sample will be replaced. Continue?`,
    );
    if (!confirmed) return;

    startGenerate(async () => {
      const result = await generateSampleAction({ engagementId, moduleCode });

      if (result.success) {
        const { totalSelected, warnings: newWarnings } = result.data;
        setIsLocked(true);
        setWarnings(newWarnings);
        toast.success(
          `Sample generated: ${totalSelected} accounts selected.${newWarnings.length > 0 ? " See warnings below." : ""}`,
        );
      } else {
        toast.error(result.error ?? "Failed to generate sample.");
      }
    });
  }

  // ─── Unlock handler ───────────────────────────────────────────────────────

  function handleUnlock() {
    setIsLocked(false);
    setWarnings([]);
    // Note: actual DB unlock happens when user saves new criteria
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sampling Criteria</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Locked banner */}
        {isLocked && (
          <div className="bg-muted flex items-center justify-between rounded-md px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4" />
              <span>Criteria are locked. To reconfigure, click Unlock.</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUnlock}
              disabled={isSaving || isGenerating}
            >
              Unlock
            </Button>
          </div>
        )}

        {/* Sample size input section */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Overall Sample Size</label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={100}
              step={0.5}
              value={sampleSizePct}
              onChange={(e) =>
                setSampleSizePct(
                  Math.max(1, Math.min(100, Number(e.target.value))),
                )
              }
              disabled={isDisabled}
              className="w-24"
            />
            <span className="text-muted-foreground text-sm">
              % of {portfolioCount} accounts ={" "}
              <span className="text-foreground font-medium">
                {totalSampleCount} accounts
              </span>
            </span>
          </div>
        </div>

        {/* Criteria bucket table */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Criteria Bucket Allocations
          </label>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Bucket</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-28 text-right">
                  Allocation (%)
                </TableHead>
                <TableHead className="w-28 text-right">Accounts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {BUCKET_DEFAULTS.map((def) => {
                const pct = bucketPcts[def.bucket];
                const count = Math.round((totalSampleCount * pct) / 100);
                return (
                  <TableRow key={def.bucket}>
                    <TableCell className="font-medium">{def.label}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {def.description}
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={pct}
                        onChange={(e) =>
                          setBucketPcts((prev) => ({
                            ...prev,
                            [def.bucket]: Math.max(
                              0,
                              Math.min(100, Number(e.target.value)),
                            ),
                          }))
                        }
                        disabled={isDisabled}
                        className="h-8 w-20 text-right"
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-right text-sm">
                      {count}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Running total */}
          <div className="flex justify-end pr-4">
            <span
              className={cn(
                "text-sm font-medium",
                isValid
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400",
              )}
            >
              Total: {bucketSum}%{" "}
              {!isValid && (
                <span className="font-normal">(must equal 100%)</span>
              )}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={!isValid || isDisabled}>
            {isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Criteria
          </Button>

          {savedConfig && !isLocked && (
            <Button
              variant="outline"
              onClick={handleGenerate}
              disabled={isDisabled || !isValid}
            >
              {isGenerating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Generate Sample
            </Button>
          )}
        </div>

        {/* Redistribution warnings */}
        {warnings.length > 0 && (
          <Alert className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">
              Redistribution Warnings
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                {warnings.map((w, i) => (
                  <li key={i}>
                    <span className="font-medium">
                      {BUCKET_DEFAULTS.find((d) => d.bucket === w.bucket)
                        ?.label ?? w.bucket}
                    </span>
                    : {w.filled}/{w.requested} filled, {w.shortfall}{" "}
                    redistributed to{" "}
                    {BUCKET_DEFAULTS.find((d) => d.bucket === w.redistributedTo)
                      ?.label ?? w.redistributedTo}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
