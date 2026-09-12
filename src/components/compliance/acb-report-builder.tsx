"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Download, Loader2, FileText } from "@/lib/icons";
import { generateAcbReport } from "@/actions/compliance/acb-reporting";

interface AcbItem {
  id: string;
  daysOpen: number;
  escalationLevel: number;
  status: string;
  observation?: {
    id: string;
    title: string;
    severity: string;
  };
  branch?: {
    id: string;
    name: string;
    code: string;
  };
  audit?: {
    id: string;
    auditNumber: string | null;
  };
}

interface BoardReport {
  id: string;
  year: number;
  quarter: string;
  title: string;
  generatedAt: Date;
  metricsSnapshot?: any;
  s3Key?: string | null;
}

interface AcbReportBuilderProps {
  items: AcbItem[];
  existingReports: BoardReport[];
}

export function AcbReportBuilder({
  items,
  existingReports,
}: AcbReportBuilderProps) {
  const router = useRouter();
  const [reportTitle, setReportTitle] = useState("");
  const [executiveCommentary, setExecutiveCommentary] = useState("");
  const [quarter, setQuarter] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportingPdfId, setExportingPdfId] = useState<string | null>(null);

  // Calculate summary stats
  const totalItems = items.length;
  const bySeverity = {
    critical: items.filter((i) => i.observation?.severity === "CRITICAL")
      .length,
    high: items.filter((i) => i.observation?.severity === "HIGH").length,
    medium: items.filter((i) => i.observation?.severity === "MEDIUM").length,
    low: items.filter((i) => i.observation?.severity === "LOW").length,
  };

  const byBranch = items.reduce(
    (acc, item) => {
      const branchName = item.branch?.name ?? "Unknown";
      acc[branchName] = (acc[branchName] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-100 text-red-800";
      case "HIGH":
        return "bg-orange-100 text-orange-800";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800";
      case "LOW":
        return "bg-blue-100 text-blue-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleGenerateReport = async () => {
    if (!reportTitle.trim() || !quarter.trim()) {
      toast.error("Please provide report title and quarter");
      return;
    }

    setIsGenerating(true);

    const result = await generateAcbReport({
      quarter,
      title: reportTitle,
      executiveCommentary: executiveCommentary || undefined,
    });

    setIsGenerating(false);

    if (result.success) {
      toast.success(
        `Board report generated: ${result.data.itemCount} items included`,
      );
      setReportTitle("");
      setExecutiveCommentary("");
      setQuarter("");
      router.refresh();
    } else {
      toast.error(result.error);
    }
  };

  const handleDownload = (s3Key: string) => {
    window.open(`/api/download?key=${encodeURIComponent(s3Key)}`, "_blank");
  };

  const handleExportPdf = async (report: BoardReport) => {
    setExportingPdfId(report.id);
    try {
      const res = await fetch("/api/reports/board-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: report.year,
          quarter: report.quarter,
          executiveCommentary: report.metricsSnapshot?.executiveCommentary,
        }),
      });

      if (!res.ok) {
        const err = await res
          .json()
          .catch(() => ({ error: "PDF generation failed" }));
        toast.error(err.error ?? "Failed to export PDF");
        return;
      }

      // Download the returned PDF
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `acb-report-${report.quarter}-FY${report.year}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF exported successfully");
    } catch {
      toast.error("Failed to export PDF");
    } finally {
      setExportingPdfId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Items
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalItems}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Critical
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {bySeverity.critical}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              High
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {bySeverity.high}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Medium
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {bySeverity.medium}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Low
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {bySeverity.low}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By Branch Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Items by Branch</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Object.entries(byBranch)
              .sort(([, a], [, b]) => b - a)
              .map(([branch, count]) => (
                <div
                  key={branch}
                  className="flex items-center justify-between rounded border p-2"
                >
                  <span className="text-sm font-medium">{branch}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Consolidated Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>ACB-Eligible Compliance Items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Branch</TableHead>
                  <TableHead>Observation</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                  <TableHead className="text-right">Escalation Level</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.branch?.name ?? "N/A"}
                      <div className="text-muted-foreground text-xs">
                        {item.branch?.code}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-md truncate">
                        {item.observation?.title ?? "N/A"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={getSeverityColor(
                          item.observation?.severity ?? "MEDIUM",
                        )}
                      >
                        {item.observation?.severity ?? "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-bold">
                      {item.daysOpen}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">L{item.escalationLevel}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{item.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground h-24 text-center"
                    >
                      No items eligible for ACB reporting
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Generate Report Form */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Board Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="quarter">Quarter (YYYY-Q1..Q4) *</Label>
              <Input
                id="quarter"
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                placeholder="e.g., 2025-Q3"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="title">Report Title *</Label>
              <Input
                id="title"
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                placeholder="e.g., ACB Quarterly Compliance Report Q3 2025"
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="commentary">Executive Commentary</Label>
            <Textarea
              id="commentary"
              value={executiveCommentary}
              onChange={(e) => setExecutiveCommentary(e.target.value)}
              placeholder="CAE's commentary on the quarter's compliance performance..."
              rows={6}
              className="mt-1"
            />
          </div>

          <Button
            onClick={handleGenerateReport}
            disabled={isGenerating}
            className="w-full md:w-auto"
          >
            {isGenerating ? "Generating..." : "Generate Board Report"}
          </Button>
        </CardContent>
      </Card>

      {/* Previous Reports */}
      <Card>
        <CardHeader>
          <CardTitle>Previous Board Reports</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Quarter</TableHead>
                  <TableHead>Generated At</TableHead>
                  <TableHead className="text-right">Items</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {existingReports.map((report) => (
                  <TableRow key={report.id}>
                    <TableCell className="font-medium">
                      {report.title}
                    </TableCell>
                    <TableCell>{report.year}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{report.quarter}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(report.generatedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {report.metricsSnapshot?.totalItems ?? "N/A"}
                    </TableCell>
                    <TableCell className="text-right">
                      {report.s3Key ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(report.s3Key!)}
                        >
                          <Download className="mr-1 h-4 w-4" />
                          Download
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={exportingPdfId === report.id}
                          onClick={() => handleExportPdf(report)}
                        >
                          {exportingPdfId === report.id ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="mr-1 h-4 w-4" />
                          )}
                          Export PDF
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {existingReports.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-muted-foreground h-24 text-center"
                    >
                      No board reports generated yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
