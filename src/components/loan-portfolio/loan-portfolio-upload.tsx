"use client";

import { useRef, useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Download,
  FileText,
  AlertTriangle,
  Loader2,
} from "@/lib/icons";
import { importLoanPortfolio } from "@/actions/loan-portfolio/import-loan-portfolio";
import { parseExcelFile } from "@/actions/loan-portfolio/parse-excel-file";
import {
  detectColumnMapping,
  validateAndTransformRows,
} from "@/lib/loan-portfolio/column-mapper";
import { parseCsvText } from "@/lib/loan-portfolio/csv-parser";
import type {
  ColumnMapping,
  ImportSummary,
  RowValidationError,
  ValidationResult,
} from "@/lib/loan-portfolio/types";
import { ColumnMappingPreview } from "./column-mapping-preview";
import { ImportSummaryView } from "./import-summary";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoanPortfolioUploadProps {
  engagementId: string;
  /** moduleCode → count of existing accounts */
  existingAccountCounts: Record<string, number>;
  /** available credit modules for the selector */
  moduleOptions: { code: string; label: string }[];
}

type UploadState =
  | { phase: "idle" }
  | {
      phase: "mapping";
      mappings: ColumnMapping[];
      rawRows: Record<string, string>[];
    }
  | { phase: "confirming"; validatedResult: ValidationResult }
  | { phase: "importing" }
  | {
      phase: "summary";
      summary: ImportSummary;
      rejectedRows: { rowNumber: number; errors: RowValidationError[] }[];
      warnings: { rowNumber: number; message: string }[];
    }
  | { phase: "error"; message: string };

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * Main upload component for the Loan Portfolio tab.
 *
 * State machine:
 * idle → [file selected] → mapping → [confirm] → (replace dialog?) → importing → summary
 *                                  → [cancel] → idle
 */
export function LoanPortfolioUpload({
  engagementId,
  existingAccountCounts,
  moduleOptions,
}: LoanPortfolioUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [selectedModule, setSelectedModule] = useState<string>(
    moduleOptions[0]?.code ?? "",
  );
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  // For the replace confirmation dialog
  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [pendingValidation, setPendingValidation] =
    useState<ValidationResult | null>(null);

  // ── File processing ────────────────────────────────────────────────────────

  async function processFile(file: File) {
    if (!selectedModule) {
      toast.error("Please select a credit module before uploading.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "xlsx") {
      toast.error("Only CSV (.csv) and Excel (.xlsx) files are supported.");
      return;
    }

    setIsParsing(true);

    try {
      let headers: string[];
      let rows: Record<string, string>[];

      if (ext === "csv") {
        // Parse CSV client-side for instant feedback
        const text = await file.text();
        const result = parseCsvText(text);
        headers = result.headers;
        rows = result.rows;
      } else {
        // Excel: send to server action (ExcelJS is server-side only)
        const formData = new FormData();
        formData.append("file", file);
        const result = await parseExcelFile(formData);
        if (!result.success) {
          setState({ phase: "error", message: result.error });
          return;
        }
        headers = result.data.headers;
        rows = result.data.rows;
      }

      if (headers.length === 0) {
        setState({
          phase: "error",
          message: "The file appears to be empty or has no headers.",
        });
        return;
      }

      if (rows.length === 0) {
        setState({
          phase: "error",
          message: "The file has headers but no data rows.",
        });
        return;
      }

      const mappings = detectColumnMapping(headers, selectedModule);
      setState({ phase: "mapping", mappings, rawRows: rows });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to read the file.";
      setState({ phase: "error", message });
    } finally {
      setIsParsing(false);
    }
  }

  // ── Drag-and-drop handlers ─────────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = "";
  }

  // ── Mapping confirmed → validate rows ─────────────────────────────────────

  function handleMappingConfirm() {
    if (state.phase !== "mapping") return;

    const validationResult = validateAndTransformRows(
      state.rawRows,
      state.mappings,
      selectedModule,
    );

    // Check if module already has accounts — show replace confirmation
    const existingCount = existingAccountCounts[selectedModule] ?? 0;
    if (existingCount > 0) {
      setPendingValidation(validationResult);
      setShowReplaceDialog(true);
    } else {
      runImport(validationResult);
    }
  }

  // ── Run import ─────────────────────────────────────────────────────────────

  async function runImport(validationResult: ValidationResult) {
    setState({ phase: "importing" });

    const result = await importLoanPortfolio({
      engagementId,
      moduleCode: selectedModule,
      rows: validationResult.validRows,
    });

    if (result.success) {
      const moduleLabel =
        moduleOptions.find((m) => m.code === selectedModule)?.label ??
        selectedModule;
      toast.success(
        `Successfully imported ${result.data.imported} accounts for ${moduleLabel}.`,
      );
    }

    const totalRows =
      validationResult.validRows.length + validationResult.rejectedRows.length;

    setState({
      phase: "summary",
      summary: {
        totalRows,
        accepted: result.success ? result.data.imported : 0,
        rejected: validationResult.rejectedRows.length,
        warnings: validationResult.warnings.length,
      },
      rejectedRows: validationResult.rejectedRows,
      warnings: validationResult.warnings,
    });
  }

  // ── Replace dialog confirmed ───────────────────────────────────────────────

  function handleReplaceConfirm() {
    setShowReplaceDialog(false);
    if (pendingValidation) {
      const vr = pendingValidation;
      setPendingValidation(null);
      runImport(vr);
    }
  }

  function handleReplaceCancel() {
    setShowReplaceDialog(false);
    setPendingValidation(null);
    setState({ phase: "idle" });
  }

  // ── Reset to idle ──────────────────────────────────────────────────────────

  function resetToIdle() {
    setState({ phase: "idle" });
    setPendingValidation(null);
    router.refresh();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const existingCount = existingAccountCounts[selectedModule] ?? 0;
  const selectedModuleLabel =
    moduleOptions.find((m) => m.code === selectedModule)?.label ??
    selectedModule;

  return (
    <>
      {/* Replace confirmation dialog */}
      <AlertDialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace Existing Portfolio?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace{" "}
              <strong>
                {existingCount} existing account
                {existingCount !== 1 ? "s" : ""}
              </strong>{" "}
              for <strong>{selectedModuleLabel}</strong> at this branch. The new
              file has{" "}
              <strong>
                {pendingValidation?.validRows.length ?? 0} valid row
                {(pendingValidation?.validRows.length ?? 0) !== 1 ? "s" : ""}
              </strong>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleReplaceCancel}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleReplaceConfirm}>
              Replace Portfolio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-6">
        {/* Module selector + template download — always visible */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Credit Module:</span>
            <Select
              value={selectedModule}
              onValueChange={setSelectedModule}
              disabled={state.phase !== "idle"}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select module..." />
              </SelectTrigger>
              <SelectContent>
                {moduleOptions.map((m) => (
                  <SelectItem key={m.code} value={m.code}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <a
            href={`/api/loan-portfolio/template?moduleCode=${selectedModule}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" type="button">
              <Download className="mr-2 h-4 w-4" />
              Download Template
            </Button>
          </a>

          {existingCount > 0 && state.phase === "idle" && (
            <span className="text-muted-foreground text-sm">
              {existingCount} account{existingCount !== 1 ? "s" : ""} already
              uploaded for {selectedModuleLabel}
            </span>
          )}
        </div>

        {/* State: idle — drag-drop zone */}
        {state.phase === "idle" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Upload Portfolio File
              </CardTitle>
              <CardDescription>
                Upload a CSV or Excel file with loan account data for{" "}
                {selectedModuleLabel}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                } ${isParsing ? "pointer-events-none opacity-60" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => !isParsing && fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ")
                    fileInputRef.current?.click();
                }}
                aria-label="File upload area"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="text-muted-foreground mb-3 h-10 w-10 animate-spin" />
                    <p className="text-muted-foreground text-sm">
                      Parsing file...
                    </p>
                  </>
                ) : (
                  <>
                    <Upload className="text-muted-foreground mb-3 h-10 w-10" />
                    <p className="mb-1 text-sm font-medium">
                      Drag &amp; drop CSV or Excel file here
                    </p>
                    <p className="text-muted-foreground text-sm">
                      or click to browse
                    </p>
                    <p className="text-muted-foreground mt-2 text-xs">
                      Supported formats: .csv, .xlsx
                    </p>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileChange}
                className="sr-only"
                aria-hidden="true"
              />
            </CardContent>
          </Card>
        )}

        {/* State: mapping — column mapping preview */}
        {state.phase === "mapping" && (
          <ColumnMappingPreview
            mappings={state.mappings}
            onConfirm={handleMappingConfirm}
            onCancel={() => setState({ phase: "idle" })}
          />
        )}

        {/* State: importing — loading spinner */}
        {state.phase === "importing" && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Loader2 className="text-primary mb-4 h-10 w-10 animate-spin" />
              <p className="text-sm font-medium">Importing loan portfolio...</p>
              <p className="text-muted-foreground text-sm">
                Please wait, this may take a moment.
              </p>
            </CardContent>
          </Card>
        )}

        {/* State: summary — import results */}
        {state.phase === "summary" && (
          <ImportSummaryView
            summary={state.summary}
            rejectedRows={state.rejectedRows}
            warnings={state.warnings}
            onDismiss={resetToIdle}
          />
        )}

        {/* State: error — error alert */}
        {state.phase === "error" && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{state.message}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setState({ phase: "idle" })}
                className="ml-4 shrink-0"
              >
                Try Again
              </Button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </>
  );
}
