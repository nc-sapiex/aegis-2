"use client";

import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
} from "@/lib/icons";
import {
  requestEvidenceUpload,
  confirmEvidenceUpload,
} from "@/actions/auditee";

// ─── Types ──────────────────────────────────────────────────────────────────

type FileStatus = "queued" | "uploading" | "confirming" | "complete" | "error";

interface UploadEntry {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  s3Key?: string;
  retryCount: number;
}

interface EvidenceUploaderProps {
  observationId: string;
  onUploadComplete?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const MAX_CONCURRENT = 3;
const MAX_RETRIES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const ACCEPTED_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function readFileHeader(file: File): Promise<string> {
  const chunk = file.slice(0, 4096);
  const buffer = await chunk.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function backoffDelay(attempt: number): number {
  return Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
}

// ─── Component ──────────────────────────────────────────────────────────────

export function EvidenceUploader({
  observationId,
  onUploadComplete,
}: EvidenceUploaderProps) {
  const [entries, setEntries] = useState<UploadEntry[]>([]);
  const activeCountRef = useRef(0);
  const queueRef = useRef<UploadEntry[]>([]);

  // Update a specific entry by id
  const updateEntry = useCallback(
    (id: string, updates: Partial<UploadEntry>) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, ...updates } : e)),
      );
    },
    [],
  );

  // Process next item in queue if under concurrency limit
  const processQueue = useCallback(() => {
    while (
      activeCountRef.current < MAX_CONCURRENT &&
      queueRef.current.length > 0
    ) {
      const entry = queueRef.current.shift();
      if (entry) {
        activeCountRef.current++;
        void uploadFile(entry);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Full upload flow for a single file
  const uploadFile = useCallback(
    async (entry: UploadEntry) => {
      try {
        // Step 1: Read file header (first 4KB as base64)
        updateEntry(entry.id, { status: "uploading", progress: 0 });
        const fileHeader = await readFileHeader(entry.file);

        // Step 2: Request presigned URL from server
        const requestResult = await requestEvidenceUpload({
          observationId,
          fileHeader,
          fileName: entry.file.name,
          fileSize: entry.file.size,
        });

        if (!requestResult.success) {
          updateEntry(entry.id, {
            status: "error",
            error: requestResult.error,
          });
          activeCountRef.current--;
          processQueue();
          return;
        }

        const { presignedUrl, s3Key, contentType } = requestResult.data!;
        updateEntry(entry.id, { s3Key });

        // Step 3: Upload to S3 via XMLHttpRequest (for progress tracking)
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              updateEntry(entry.id, { progress: pct });
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`S3 upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during upload"));

          xhr.open("PUT", presignedUrl);
          xhr.setRequestHeader("Content-Type", contentType);
          xhr.send(entry.file);
        });

        // Step 4: Confirm upload with server
        updateEntry(entry.id, { status: "confirming", progress: 100 });

        const confirmResult = await confirmEvidenceUpload({
          observationId,
          s3Key,
          filename: entry.file.name,
          fileSize: entry.file.size,
          contentType,
        });

        if (!confirmResult.success) {
          updateEntry(entry.id, {
            status: "error",
            error: confirmResult.error,
          });
          activeCountRef.current--;
          processQueue();
          return;
        }

        // Success
        updateEntry(entry.id, { status: "complete", progress: 100 });
        toast.success(`${entry.file.name} uploaded successfully`);
        onUploadComplete?.();
      } catch (error) {
        const currentRetry = entry.retryCount;
        if (currentRetry < MAX_RETRIES) {
          // Retry with exponential backoff
          const delay = backoffDelay(currentRetry);
          updateEntry(entry.id, {
            status: "queued",
            progress: 0,
            error: `Retrying in ${delay / 1000}s...`,
            retryCount: currentRetry + 1,
          });

          setTimeout(() => {
            const retryEntry: UploadEntry = {
              ...entry,
              retryCount: currentRetry + 1,
            };
            queueRef.current.push(retryEntry);
            processQueue();
          }, delay);
        } else {
          updateEntry(entry.id, {
            status: "error",
            error:
              error instanceof Error
                ? error.message
                : "Upload failed after 3 attempts",
          });
        }
      } finally {
        activeCountRef.current--;
        processQueue();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [observationId, onUploadComplete, updateEntry, processQueue],
  );

  // Handle files dropped/selected
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newEntries: UploadEntry[] = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "queued" as const,
        progress: 0,
        retryCount: 0,
      }));

      setEntries((prev) => [...prev, ...newEntries]);
      queueRef.current.push(...newEntries);
      processQueue();
    },
    [processQueue],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_FILE_SIZE,
    onDropRejected: (rejections) => {
      rejections.forEach((r) => {
        const msg = r.errors.map((e) => e.message).join(", ");
        toast.error(`${r.file.name}: ${msg}`);
      });
    },
  });

  // Manual retry for a failed upload
  const handleRetry = (entry: UploadEntry) => {
    const retryEntry: UploadEntry = {
      ...entry,
      status: "queued",
      progress: 0,
      error: undefined,
      retryCount: 0,
    };
    updateEntry(entry.id, retryEntry);
    queueRef.current.push(retryEntry);
    processQueue();
  };

  // Remove a queued file
  const handleRemove = (id: string) => {
    queueRef.current = queueRef.current.filter((e) => e.id !== id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        {...getRootProps()}
        className={`cursor-pointer rounded-md border-2 border-dashed p-6 text-center transition-colors ${
          isDragActive
            ? "border-blue-400 bg-blue-50"
            : "border-muted-foreground/25 hover:border-muted-foreground/50"
        }`}
      >
        <input {...getInputProps()} />
        <FileText className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
        {isDragActive ? (
          <p className="text-sm font-medium text-blue-600">
            Drop files here...
          </p>
        ) : (
          <div>
            <p className="text-sm font-medium">
              Drag & drop evidence files, or click to browse
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              PDF, JPEG, PNG, DOCX, XLSX — max 10MB each
            </p>
          </div>
        )}
      </div>

      {/* Upload queue */}
      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-3 rounded-md border p-3"
            >
              <div className="flex-shrink-0">
                {entry.status === "complete" ? (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                ) : entry.status === "error" ? (
                  <XCircle className="h-5 w-5 text-red-600" />
                ) : entry.status === "uploading" ||
                  entry.status === "confirming" ? (
                  <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                ) : (
                  <FileText className="text-muted-foreground h-5 w-5" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {entry.file.name}
                  </p>
                  <span className="text-muted-foreground flex-shrink-0 text-xs">
                    {formatFileSize(entry.file.size)}
                  </span>
                </div>

                {(entry.status === "uploading" ||
                  entry.status === "confirming") && (
                  <div className="mt-1.5">
                    <Progress value={entry.progress} className="h-1.5" />
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {entry.status === "confirming"
                        ? "Verifying..."
                        : `${entry.progress}%`}
                    </p>
                  </div>
                )}

                {entry.status === "error" && entry.error && (
                  <p className="mt-1 text-xs text-red-600">{entry.error}</p>
                )}
              </div>

              <div className="flex flex-shrink-0 gap-1">
                {entry.status === "error" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRetry(entry)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                {(entry.status === "queued" || entry.status === "error") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(entry.id)}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
