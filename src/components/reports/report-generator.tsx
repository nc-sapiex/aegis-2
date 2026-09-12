"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { generateXlsxReport } from "@/actions/reports/generate-xlsx";
import { generatePdfReport } from "@/actions/reports/generate-pdf";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSpreadsheet, FileText, Loader2, Download } from "@/lib/icons";
import { toast } from "sonner";

interface ReportGeneratorProps {
  canGenerate: boolean;
  templates: Array<{
    id: string;
    name: string;
    category: string;
    versionNumber: number;
  }>;
}

export function ReportGenerator({
  canGenerate,
  templates,
}: ReportGeneratorProps) {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [engagementId, setEngagementId] = React.useState("");
  const [selectedTemplate, setSelectedTemplate] = React.useState<string | null>(
    null,
  );

  const handleGenerateXlsx = async () => {
    if (!engagementId.trim()) {
      toast.error("Please provide an engagement ID");
      return;
    }

    setIsGenerating(true);
    const result = await generateXlsxReport({
      engagementId,
      ...(selectedTemplate && { templateId: selectedTemplate }),
    });
    setIsGenerating(false);

    if (result.success) {
      toast.success("XLSX report generated successfully");
      // In production, you'd provide a download link here
      toast.info(`S3 Key: ${result.data.s3Key}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleGeneratePdf = async () => {
    if (!engagementId.trim()) {
      toast.error("Please provide an engagement ID");
      return;
    }

    setIsGenerating(true);
    const result = await generatePdfReport({
      engagementId,
      ...(selectedTemplate && { templateId: selectedTemplate }),
    });
    setIsGenerating(false);

    if (result.success) {
      toast.success("PDF report generated successfully");
      toast.info(`S3 Key: ${result.data.s3Key}`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  if (!canGenerate) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-8 text-center">
          You do not have permission to generate reports.
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue="xlsx" className="space-y-4">
      <TabsList>
        <TabsTrigger value="xlsx">XLSX Export</TabsTrigger>
        <TabsTrigger value="pdf">PDF Summary</TabsTrigger>
        <TabsTrigger value="templates">Templates</TabsTrigger>
      </TabsList>

      {/* XLSX Export */}
      <TabsContent value="xlsx">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="text-primary h-5 w-5" />
              <CardTitle>Generate XLSX Report</CardTitle>
            </div>
            <CardDescription>
              Export detailed audit data to Excel format (XLSX)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="engagement-xlsx">Audit Engagement ID</Label>
              <Input
                id="engagement-xlsx"
                placeholder="Enter engagement ID (UUID)"
                value={engagementId}
                onChange={(e) => setEngagementId(e.target.value)}
                disabled={isGenerating}
              />
              <p className="text-muted-foreground text-xs">
                Generate a comprehensive audit report with all findings, cash
                checks, loan reviews, and SMA/NPA data
              </p>
            </div>
            <Button onClick={handleGenerateXlsx} disabled={isGenerating}>
              {isGenerating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Generate XLSX
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* PDF Summary */}
      <TabsContent value="pdf">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText className="text-primary h-5 w-5" />
              <CardTitle>Generate PDF Summary</CardTitle>
            </div>
            <CardDescription>
              Create an executive summary report in PDF format
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="engagement-pdf">Audit Engagement ID</Label>
              <Input
                id="engagement-pdf"
                placeholder="Enter engagement ID (UUID)"
                value={engagementId}
                onChange={(e) => setEngagementId(e.target.value)}
                disabled={isGenerating}
              />
              <p className="text-muted-foreground text-xs">
                Generate a formatted PDF summary for board presentations and
                executive review
              </p>
            </div>
            <Button onClick={handleGeneratePdf} disabled={isGenerating}>
              {isGenerating && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <FileText className="mr-2 h-4 w-4" />
              Generate PDF
            </Button>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Templates */}
      <TabsContent value="templates">
        <Card>
          <CardHeader>
            <CardTitle>Report Templates</CardTitle>
            <CardDescription>
              {templates.length} active report templates
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedTemplate && (
              <div className="border-primary/30 bg-primary/5 mb-4 rounded-md border p-3">
                <p className="text-primary text-sm font-medium">
                  Active template:{" "}
                  {templates.find((t) => t.id === selectedTemplate)?.name}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  This template will be applied when generating reports. Select
                  an engagement ID above and generate.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => {
                    setSelectedTemplate(null);
                    toast.info("Template deselected");
                  }}
                >
                  Clear Selection
                </Button>
              </div>
            )}
            {templates.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center">
                No templates configured.
              </p>
            ) : (
              <div className="space-y-3">
                {templates.map((template) => {
                  const isActive = selectedTemplate === template.id;
                  return (
                    <div
                      key={template.id}
                      className={`flex items-center justify-between rounded-md border p-3 transition-colors ${
                        isActive
                          ? "border-primary bg-primary/5"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div>
                        <p className="font-medium">{template.name}</p>
                        <p className="text-muted-foreground text-sm">
                          {template.category} • v{template.versionNumber}
                        </p>
                      </div>
                      <Button
                        variant={isActive ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          if (isActive) {
                            setSelectedTemplate(null);
                            toast.info("Template deselected");
                          } else {
                            setSelectedTemplate(template.id);
                            toast.success(
                              `Template "${template.name}" selected — switch to XLSX or PDF tab to generate`,
                            );
                          }
                        }}
                      >
                        <Download className="mr-1 h-4 w-4" />
                        {isActive ? "Selected" : "Use"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
