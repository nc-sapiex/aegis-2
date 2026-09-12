"use client";

/**
 * Excel Upload Zone component for onboarding org structure (Step 4).
 *
 * Features:
 * - Download template button (generates Excel via server action)
 * - Drag-and-drop upload zone (react-dropzone)
 * - Status feedback: idle, uploading, success, error
 * - Warnings display for rows with missing optional fields
 * - Calls onImport callback with parsed data after successful upload
 * - Auto-switches to manual entry view after import (via parent component)
 */

import { useState } from "react";
import { useDropzone } from "react-dropzone";
import type { BranchEntry, DepartmentEntry } from "@/types/onboarding";
import {
  downloadOrgStructureTemplate,
  uploadOrgStructureExcel,
} from "@/actions/onboarding-excel-upload";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  Download,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

interface ExcelUploadZoneProps {
  onImport: (data: {
    branches: BranchEntry[];
    departments: DepartmentEntry[];
  }) => void;
}

type UploadStatus = "idle" | "uploading" | "success" | "error";

export function ExcelUploadZone({ onImport }: ExcelUploadZoneProps) {
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [importedCounts, setImportedCounts] = useState<{
    branches: number;
    departments: number;
  } | null>(null);

  // ─── Dropzone Configuration ────────────────────────────────────────────

  const onDrop = async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const file = acceptedFiles[0];
    setStatus("uploading");
    setErrorMessage(null);
    setWarnings([]);

    try {
      // Create FormData and append file
      const formData = new FormData();
      formData.append("file", file);

      // Call server action
      const result = await uploadOrgStructureExcel(formData);

      if (result.success) {
        // Success: show success state
        setStatus("success");
        setWarnings(result.warnings);
        setImportedCounts({
          branches: result.data.branches.length,
          departments: result.data.departments.length,
        });

        // Call onImport callback after 500ms delay (so user sees success state)
        setTimeout(() => {
          onImport(result.data);
        }, 500);
      } else {
        // Error: show error state
        setStatus("error");
        setErrorMessage(result.error);
      }
    } catch (error) {
      console.error("Upload error:", error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Upload failed. Please try again.",
      );
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    maxFiles: 1,
    multiple: false,
  });

  // ─── Download Template Handler ─────────────────────────────────────────

  const handleDownloadTemplate = async () => {
    try {
      const result = await downloadOrgStructureTemplate();

      if (result.success) {
        // Decode base64 to Blob
        const byteCharacters = atob(result.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });

        // Create object URL and trigger download
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } else {
        console.error("Download failed:", result.error);
        alert(`Failed to download template: ${result.error}`);
      }
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download template. Please try again.");
    }
  };

  // ─── Reset Handler ─────────────────────────────────────────────────────

  const handleReset = () => {
    setStatus("idle");
    setErrorMessage(null);
    setWarnings([]);
    setImportedCounts(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Download Template Section */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
        <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Download the Excel template
            </p>
            <p className="text-muted-foreground text-sm">
              Fill in your branches and departments, then upload below.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="bg-white dark:bg-gray-950"
          >
            <Download className="mr-2 h-4 w-4" />
            Download Template
          </Button>
        </div>
      </div>

      {/* Upload Zone */}
      <Card>
        <div
          {...getRootProps()}
          className={cn(
            "cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
            isDragActive && "border-primary bg-primary/5",
            !isDragActive &&
              status === "idle" &&
              "border-gray-300 hover:border-gray-400 dark:border-gray-700 dark:hover:border-gray-600",
            status === "uploading" &&
              "border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950",
            status === "success" &&
              "border-green-400 bg-green-50 dark:border-green-700 dark:bg-green-950",
            status === "error" &&
              "border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950",
          )}
        >
          <input {...getInputProps()} />

          {/* Idle State */}
          {status === "idle" && (
            <div className="space-y-3">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <div>
                <p className="text-base font-medium">
                  Drag & drop .xlsx file here, or click to browse
                </p>
                <p className="text-muted-foreground text-sm">
                  Maximum file size: 2MB
                </p>
              </div>
            </div>
          )}

          {/* Uploading State */}
          {status === "uploading" && (
            <div className="space-y-3">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-blue-600" />
              <p className="text-base font-medium text-blue-900 dark:text-blue-100">
                Processing...
              </p>
            </div>
          )}

          {/* Success State */}
          {status === "success" && importedCounts && (
            <div className="space-y-3">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <div>
                <p className="text-base font-medium text-green-900 dark:text-green-100">
                  Imported {importedCounts.branches} branches and{" "}
                  {importedCounts.departments} departments
                </p>
                {warnings.length > 0 && (
                  <Alert variant="default" className="mt-3 text-left">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription>
                      <p className="mb-2 font-medium">Warnings:</p>
                      <ul className="list-inside list-disc space-y-1 text-sm">
                        {warnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </div>
          )}

          {/* Error State */}
          {status === "error" && errorMessage && (
            <div className="space-y-3">
              <XCircle className="mx-auto h-12 w-12 text-red-600" />
              <div>
                <p className="text-base font-medium text-red-900 dark:text-red-100">
                  Upload failed
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {errorMessage}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="mt-3"
                >
                  Try again
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
