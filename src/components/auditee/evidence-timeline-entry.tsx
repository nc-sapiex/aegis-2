"use client";

import { FileText } from "@/lib/icons";
import { formatDate } from "@/lib/utils";

interface EvidenceTimelineEntryProps {
  entry: {
    event: string;
    comment?: string | null;
    createdAt: Date | string;
    createdBy?: { id: string; name: string } | null;
  };
}

export function EvidenceTimelineEntry({ entry }: EvidenceTimelineEntryProps) {
  const date =
    typeof entry.createdAt === "string"
      ? new Date(entry.createdAt)
      : entry.createdAt;

  // Extract filename from comment if available (format: "filename.ext")
  const filename = entry.comment ?? "file";
  const uploaderName = entry.createdBy?.name ?? "Unknown";

  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="mt-0.5 rounded-md bg-blue-50 p-1.5">
        <FileText className="h-3.5 w-3.5 text-blue-600" />
      </div>
      <div className="space-y-0.5">
        <p className="text-foreground">
          <span className="font-medium">Evidence uploaded:</span>{" "}
          <span className="text-muted-foreground">{filename}</span>
          {" by "}
          <span className="font-medium">{uploaderName}</span>
        </p>
        <p className="text-muted-foreground text-xs">{formatDate(date)}</p>
      </div>
    </div>
  );
}
