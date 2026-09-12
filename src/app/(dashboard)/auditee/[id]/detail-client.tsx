"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, MessageSquare } from "@/lib/icons";
import { ResponseForm } from "@/components/auditee/response-form";
import { EvidenceUploader } from "@/components/auditee/evidence-uploader";
import { EvidenceList } from "@/components/auditee/evidence-list";
import { getEvidenceDownloadUrl } from "@/actions/auditee";

interface EvidenceItem {
  id: string;
  filename: string;
  contentType: string;
  fileSize: number;
  description?: string | null;
  uploadedBy?: { id: string; name: string } | null;
  createdAt: Date | string;
}

interface AuditeeDetailClientProps {
  observationId: string;
  observationStatus: string;
  evidence: EvidenceItem[];
  evidenceCount: number;
  isActive: boolean;
}

export function AuditeeDetailClient({
  observationId,
  observationStatus,
  evidence,
  evidenceCount,
  isActive,
}: AuditeeDetailClientProps) {
  const router = useRouter();

  const handleRefresh = () => {
    router.refresh();
  };

  const handleDownload = async (evidenceId: string) => {
    const result = await getEvidenceDownloadUrl(evidenceId);
    if (result.success && result.data) {
      return { downloadUrl: result.data.downloadUrl };
    }
    return { error: result.error ?? "Failed to generate download link" };
  };

  return (
    <>
      {/* Response section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="text-muted-foreground h-4 w-4" />
            Submit Response
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isActive ? (
            <ResponseForm
              observationId={observationId}
              observationStatus={observationStatus}
              onResponseSubmitted={handleRefresh}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Response period has ended. This observation is in{" "}
              <strong>{observationStatus}</strong> status.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Evidence section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <FileText className="text-muted-foreground h-4 w-4" />
              Evidence
            </span>
            <span className="text-muted-foreground text-xs font-normal">
              {evidenceCount} of 20 files uploaded
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <EvidenceList evidence={evidence} onDownload={handleDownload} />
          {isActive && (
            <EvidenceUploader
              observationId={observationId}
              onUploadComplete={handleRefresh}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}
