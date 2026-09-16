"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Camera,
} from "@/lib/icons";
import {
  requestBmEvidenceUpload,
  confirmBmEvidenceUpload,
} from "@/actions/rbia/bm-evidence";

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

interface BmEvidenceUploadPanelProps {
  actionPointId: string;
  engagementId: string;
  disabled?: boolean;
  onUploadComplete?: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

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

// ─── Component ──────────────────────────────────────────────────────────────

export function BmEvidenceUploadPanel({
  actionPointId,
  engagementId,
  disabled = false,
  onUploadComplete,
}: BmEvidenceUploadPanelProps) {
  const [entry, setEntry] = useState<UploadEntry | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // navigator.maxTouchPoints, not the width-based useIsMobile hook — a
  // landscape tablet (the real camera-capture target) is wide enough to
  // fail a max-width check but still has no keyboard/mouse-driven file picker.
  useEffect(() => {
    setIsTouchDevice(
      typeof navigator !== "undefined" && navigator.maxTouchPoints > 0,
    );
  }, []);

  // Upload a single file through the 4-step presigned URL pattern
  const uploadFile = useCallback(
    async (uploadEntry: UploadEntry) => {
      try {
        // Step 1: Read file header for magic-byte validation
        setEntry({ ...uploadEntry, status: "uploading", progress: 0 });
        const fileHeader = await readFileHeader(uploadEntry.file);

        // Step 2: Request presigned URL from server
        const requestResult = await requestBmEvidenceUpload({
          actionPointId,
          engagementId,
          fileHeader,
          fileName: uploadEntry.file.name,
          fileSize: uploadEntry.file.size,
          contentType: uploadEntry.file.type || "application/octet-stream",
        });

        if (!requestResult.success) {
          setEntry({
            ...uploadEntry,
            status: "error",
            error: requestResult.error,
          });
          toast.error(requestResult.error);
          return;
        }

        const { uploadUrl, s3Key, contentType } = requestResult.data;
        setEntry((prev) => (prev ? { ...prev, s3Key } : null));

        // Step 3: Upload to S3 via XHR with progress tracking
        abortControllerRef.current = new AbortController();

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setEntry((prev) =>
                prev ? { ...prev, progress: pct, status: "uploading" } : null,
              );
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.onabort = () => reject(new Error("Upload aborted"));

          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", contentType);
          xhr.send(uploadEntry.file);

          abortControllerRef.current!.signal.addEventListener("abort", () => {
            xhr.abort();
          });
        });

        // Step 4: Confirm upload with server to create Evidence DB record
        setEntry((prev) =>
          prev ? { ...prev, status: "confirming", progress: 100 } : null,
        );

        const confirmResult = await confirmBmEvidenceUpload({
          actionPointId,
          engagementId,
          s3Key,
          filename: uploadEntry.file.name,
          fileSize: uploadEntry.file.size,
          contentType,
        });

        if (!confirmResult.success) {
          setEntry({
            ...uploadEntry,
            status: "error",
            error: confirmResult.error,
          });
          toast.error(confirmResult.error);
          return;
        }

        // Success — show confirmation then clear
        setEntry({
          ...uploadEntry,
          status: "complete",
          progress: 100,
        });
        toast.success("Evidence uploaded successfully");

        setTimeout(() => {
          setEntry(null);
          onUploadComplete?.();
        }, 2000);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Upload failed";
        setEntry({
          ...uploadEntry,
          status: "error",
          error: errorMessage,
        });
        toast.error(errorMessage);
      }
    },
    [actionPointId, engagementId, onUploadComplete],
  );

  // Validate and queue a single file, shared by drag-drop and camera capture.
  // Server allowlist (pdf, jpeg, png, docx, xlsx, 10MB, magic bytes) is
  // unchanged — this only affects what the client offers to send.
  const queueFile = useCallback(
    (file: File | undefined) => {
      if (entry && entry.status === "uploading") {
        toast.error("Please wait for the current upload to complete");
        return;
      }
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        toast.error(`File must be under ${formatFileSize(MAX_FILE_SIZE)}`);
        return;
      }

      const newEntry: UploadEntry = {
        id: crypto.randomUUID(),
        file,
        status: "queued",
        progress: 0,
        retryCount: 0,
      };

      void uploadFile(newEntry);
    },
    [entry, uploadFile],
  );

  // Handle file drop
  const onDrop = useCallback(
    (acceptedFiles: File[]) => queueFile(acceptedFiles[0]),
    [queueFile],
  );

  // Handle a photo taken via the device camera (touch devices only).
  // ponytail: no HEIC->JPEG conversion — Android cameras emit JPEG and iOS
  // Safari already transcodes HEIC for <input accept="image/*">; the
  // server's magic-byte check rejects loudly if that ever isn't true.
  // Upgrade path: add heic2any client-side conversion if a real device
  // reports a rejection.
  const handleCameraCapture = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      queueFile(e.target.files?.[0]);
      e.target.value = "";
    },
    [queueFile],
  );

  const isUploading =
    entry?.status === "uploading" || entry?.status === "confirming";

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: disabled || isUploading,
  });

  // Retry failed upload
  const handleRetry = useCallback(() => {
    if (entry && entry.status === "error") {
      void uploadFile({ ...entry, retryCount: entry.retryCount + 1 });
    }
  }, [entry, uploadFile]);

  // Cancel in-progress upload
  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setEntry(null);
  }, []);

  // Disabled state — show read-only message instead of dropzone
  if (disabled) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
        Evidence upload is not available for responded action points.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Dropzone */}
      {!entry && (
        <div
          {...getRootProps()}
          className={`cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="text-muted-foreground mx-auto h-8 w-8" />
          <p className="text-muted-foreground mt-2 text-sm">
            {isDragActive
              ? "Drop file here..."
              : "Drag & drop evidence or click to browse"}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            PDF, JPEG, PNG, DOCX, XLSX &bull; Max{" "}
            {formatFileSize(MAX_FILE_SIZE)}
          </p>
          {isTouchDevice && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
            >
              <Camera className="mr-1.5 h-3.5 w-3.5" />
              Take Photo
            </Button>
          )}
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onClick={(e) => e.stopPropagation()}
            onChange={handleCameraCapture}
          />
        </div>
      )}

      {/* Upload progress / status */}
      {entry && (
        <div className="rounded-lg border p-4">
          <div className="flex items-start gap-3">
            <FileText className="text-muted-foreground mt-0.5 h-5 w-5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{entry.file.name}</p>
                <span className="text-muted-foreground text-xs">
                  {formatFileSize(entry.file.size)}
                </span>
              </div>

              {/* Progress bar */}
              {(entry.status === "uploading" ||
                entry.status === "confirming") && (
                <div className="space-y-1">
                  <Progress value={entry.progress} className="h-1.5" />
                  <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {entry.status === "confirming"
                      ? "Confirming upload..."
                      : `Uploading... ${entry.progress}%`}
                  </p>
                </div>
              )}

              {/* Success state */}
              {entry.status === "complete" && (
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Evidence uploaded successfully</span>
                </div>
              )}

              {/* Error state */}
              {entry.status === "error" && (
                <div className="space-y-2">
                  <div className="text-destructive flex items-center gap-2 text-sm">
                    <XCircle className="h-4 w-4" />
                    <span>{entry.error || "Upload failed"}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRetry}
                    className="h-8"
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Retry
                  </Button>
                </div>
              )}

              {/* Cancel button for in-progress uploads */}
              {isUploading && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancel}
                  className="h-8"
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
