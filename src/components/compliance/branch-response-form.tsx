"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { submitBranchResponse } from "@/actions/compliance/submit-branch-response";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, X, FileText } from "@/lib/icons";
import { toast } from "sonner";

interface BranchResponseFormProps {
  complianceItemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_FILES = 5;
const MAX_FILE_SIZE_MB = 10;
const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

export function BranchResponseForm({
  complianceItemId,
  open,
  onOpenChange,
}: BranchResponseFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [responseText, setResponseText] = React.useState("");
  const [selectedFiles, setSelectedFiles] = React.useState<File[]>([]);
  const [uploadedKeys, setUploadedKeys] = React.useState<string[]>([]);
  const [isUploading, setIsUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const valid: File[] = [];

    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: Unsupported file type`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        toast.error(`${file.name}: Exceeds ${MAX_FILE_SIZE_MB}MB limit`);
        continue;
      }
      valid.push(file);
    }

    if (selectedFiles.length + valid.length > MAX_FILES) {
      toast.error(`Maximum ${MAX_FILES} files allowed`);
      return;
    }

    setSelectedFiles((prev) => [...prev, ...valid]);

    // Reset input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async (): Promise<string[]> => {
    if (selectedFiles.length === 0) return [];

    setIsUploading(true);
    const keys: string[] = [];

    try {
      for (const file of selectedFiles) {
        // Request presigned URL from server
        const res = await fetch("/api/upload/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            prefix: `compliance/${complianceItemId}`,
          }),
        });

        if (!res.ok) {
          toast.error(`Failed to get upload URL for ${file.name}`);
          continue;
        }

        const { uploadUrl, s3Key } = await res.json();

        // Upload directly to S3
        const uploadRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });

        if (uploadRes.ok) {
          keys.push(s3Key);
        } else {
          toast.error(`Failed to upload ${file.name}`);
        }
      }
    } finally {
      setIsUploading(false);
    }

    return keys;
  };

  const handleSubmit = async () => {
    if (!responseText.trim()) {
      toast.error("Please provide a response");
      return;
    }

    setIsSubmitting(true);

    // Upload files first (R35)
    let evidenceKeys = uploadedKeys;
    if (selectedFiles.length > 0) {
      const newKeys = await uploadFiles();
      evidenceKeys = [...uploadedKeys, ...newKeys];
      setUploadedKeys(evidenceKeys);
    }

    const result = await submitBranchResponse({
      complianceItemId,
      responseText,
      evidenceS3Keys: evidenceKeys,
    });
    setIsSubmitting(false);

    if (result.success) {
      toast.success("Branch response submitted successfully");
      setResponseText("");
      setSelectedFiles([]);
      setUploadedKeys([]);
      onOpenChange(false);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Submit Branch Response</DialogTitle>
          <DialogDescription>
            Provide your response to the compliance item. This will be forwarded
            to ZAC for review.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="response">Response</Label>
            <Textarea
              id="response"
              placeholder="Describe the corrective actions taken, evidence, and timeline..."
              rows={6}
              value={responseText}
              onChange={(e) => setResponseText(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {/* Evidence Upload (R35) */}
          <div className="space-y-2">
            <Label>Evidence Attachments</Label>
            <div className="space-y-3 rounded-md border border-dashed p-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || selectedFiles.length >= MAX_FILES}
              >
                <Upload className="mr-2 h-4 w-4" />
                Attach Evidence ({selectedFiles.length}/{MAX_FILES})
              </Button>
              <p className="text-muted-foreground text-xs">
                PDF, JPEG, PNG, XLSX, DOCX — max {MAX_FILE_SIZE_MB}MB each
              </p>

              {/* File list */}
              {selectedFiles.length > 0 && (
                <div className="space-y-1">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="bg-muted flex items-center justify-between rounded px-3 py-1.5 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {(file.size / 1024).toFixed(0)} KB
                        </Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFile(idx)}
                        disabled={isSubmitting}
                        className="h-6 w-6 p-0"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-muted-foreground text-sm">
            Your response will be reviewed by the Zonal Audit Committee (ZAC)
            before closure.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isUploading}>
            {(isSubmitting || isUploading) && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {isUploading ? "Uploading..." : "Submit Response"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
