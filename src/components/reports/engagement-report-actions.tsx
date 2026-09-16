"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { generateXlsxReport } from "@/actions/reports/generate-xlsx";
import { generatePdfReport } from "@/actions/reports/generate-pdf";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText, Loader2 } from "@/lib/icons";
import { toast } from "sonner";

interface EngagementReportActionsProps {
  engagementId: string;
  canGenerate: boolean;
}

export function EngagementReportActions({
  engagementId,
  canGenerate,
}: EngagementReportActionsProps) {
  const router = useRouter();
  const [isGeneratingPdf, setIsGeneratingPdf] = React.useState(false);
  const [isGeneratingXlsx, setIsGeneratingXlsx] = React.useState(false);

  const handleGeneratePdf = async () => {
    setIsGeneratingPdf(true);
    const result = await generatePdfReport({ engagementId });
    setIsGeneratingPdf(false);

    if (result.success) {
      toast.success("PDF report generated successfully");
      toast.info(`S3 Key: ${result.data.s3Key}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleGenerateXlsx = async () => {
    setIsGeneratingXlsx(true);
    const result = await generateXlsxReport({ engagementId });
    setIsGeneratingXlsx(false);

    if (result.success) {
      toast.success("XLSX report generated successfully");
      toast.info(`S3 Key: ${result.data.s3Key}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  return (
    <div className="flex gap-4">
      <Button
        variant="outline"
        onClick={handleGeneratePdf}
        disabled={!canGenerate || isGeneratingPdf}
      >
        {isGeneratingPdf ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileText className="mr-2 h-4 w-4" />
        )}
        Generate PDF Report
      </Button>
      <Button
        variant="outline"
        onClick={handleGenerateXlsx}
        disabled={!canGenerate || isGeneratingXlsx}
      >
        {isGeneratingXlsx ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <FileSpreadsheet className="mr-2 h-4 w-4" />
        )}
        Generate Excel Report
      </Button>
    </div>
  );
}
