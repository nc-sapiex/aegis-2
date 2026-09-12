"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Loader2 } from "@/lib/icons";
import { formatDate } from "@/lib/utils";

interface EvidenceItem {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  description?: string | null;
  uploadedBy?: { id: string; name: string } | null;
  createdAt: Date | string;
}

interface EvidenceListProps {
  evidence: EvidenceItem[];
  onDownload: (
    evidenceId: string,
  ) => Promise<{ downloadUrl?: string; error?: string }>;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileTypeLabel(contentType: string): string {
  const map: Record<string, string> = {
    "application/pdf": "PDF",
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "DOCX",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  };
  return map[contentType] ?? "File";
}

export function EvidenceList({ evidence, onDownload }: EvidenceListProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (evidence.length === 0) {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
        No evidence uploaded yet
      </div>
    );
  }

  const handleDownload = (evidenceId: string) => {
    setDownloadingId(evidenceId);
    startTransition(async () => {
      const result = await onDownload(evidenceId);
      if (result.downloadUrl) {
        window.open(result.downloadUrl, "_blank");
      }
      setDownloadingId(null);
    });
  };

  return (
    <div className="space-y-2">
      {evidence.map((item) => {
        const date =
          typeof item.createdAt === "string"
            ? new Date(item.createdAt)
            : item.createdAt;
        const isDownloading = isPending && downloadingId === item.id;

        return (
          <div
            key={item.id}
            className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-blue-50 p-2">
                <FileText className="h-4 w-4 text-blue-600" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">{item.filename}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {fileTypeLabel(item.contentType)}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {formatFileSize(item.fileSize)}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatDate(date)}
                  </span>
                  {item.uploadedBy && (
                    <span className="text-muted-foreground text-xs">
                      by {item.uploadedBy.name}
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-muted-foreground text-xs">
                    {item.description}
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDownload(item.id)}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="mr-1 h-3.5 w-3.5" />
              )}
              Download
            </Button>
          </div>
        );
      })}
    </div>
  );
}
