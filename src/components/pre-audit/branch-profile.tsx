import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";
import type { BranchProfileData } from "@/data-access/pre-audit-profiling";
import {
  Building2,
  Calendar,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  XCircle,
} from "@/lib/icons";

interface BranchProfileProps {
  data: BranchProfileData;
}

/**
 * Server component for displaying pre-audit branch profiling information.
 * Shows branch details, last audit, RAM score breakdown, findings summary, and compliance status.
 */
export function BranchProfile({ data }: BranchProfileProps) {
  const {
    branch,
    lastAudit,
    ramBreakdown,
    findingsSummary,
    complianceSummary,
  } = data;

  if (!branch) {
    return (
      <div className="border-destructive bg-destructive/10 text-destructive rounded-lg border p-4">
        Branch not found
      </div>
    );
  }

  // Risk rating colors
  const getRiskRatingColor = (rating: string | null) => {
    if (!rating) return "bg-gray-100 text-gray-800";
    const upper = rating.toUpperCase();
    if (upper.includes("VERY_GOOD") || upper === "VERY GOOD")
      return "bg-green-100 text-green-800";
    if (upper.includes("GOOD")) return "bg-blue-100 text-blue-800";
    if (upper.includes("SATISFACTORY")) return "bg-yellow-100 text-yellow-800";
    if (upper.includes("MODERATE")) return "bg-orange-100 text-orange-800";
    if (upper.includes("POOR")) return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-800";
  };

  // Severity colors
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-red-100 text-red-800 border-red-300";
      case "HIGH":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "MEDIUM":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "LOW":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  // Compliance status colors
  const getComplianceStatusColor = (status: string) => {
    const upper = status.toUpperCase();
    if (upper === "CLOSED") return "bg-green-100 text-green-800";
    if (upper === "OPEN" || upper.includes("OVERDUE"))
      return "bg-red-100 text-red-800";
    if (upper.includes("APPROVED")) return "bg-blue-100 text-blue-800";
    if (upper.includes("REVIEW")) return "bg-yellow-100 text-yellow-800";
    return "bg-gray-100 text-gray-800";
  };

  // Format businessSize in lakhs
  const formatBusinessSize = (size: any) => {
    if (!size) return "N/A";
    return `₹${Number(size).toFixed(2)}L`;
  };

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Branch Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Branch Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground text-sm">Code</p>
              <p className="font-semibold">{branch.code}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Name</p>
              <p className="font-semibold">{branch.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">City</p>
              <p className="font-medium">{branch.city}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-sm">State</p>
              <p className="font-medium">{branch.state}</p>
            </div>
            {branch.category && (
              <div>
                <p className="text-muted-foreground text-sm">Category</p>
                <p className="font-medium">{branch.category}</p>
              </div>
            )}
            {branch.businessSize && (
              <div>
                <p className="text-muted-foreground text-sm">Business Size</p>
                <p className="font-medium">
                  {formatBusinessSize(branch.businessSize)}
                </p>
              </div>
            )}
            {branch.staffStrength !== null && (
              <div>
                <p className="text-muted-foreground text-sm">Staff Strength</p>
                <p className="font-medium">{branch.staffStrength}</p>
              </div>
            )}
            {branch.auditFrequency !== null && (
              <div>
                <p className="text-muted-foreground text-sm">Audit Frequency</p>
                <p className="font-medium">{branch.auditFrequency} months</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Last Audit Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Last Audit
          </CardTitle>
        </CardHeader>
        <CardContent>
          {lastAudit ? (
            <div className="space-y-3">
              <div>
                <p className="text-muted-foreground text-sm">Audit Number</p>
                <p className="font-semibold">
                  {lastAudit.auditNumber || "N/A"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-sm">Type</p>
                  <p className="font-medium">{lastAudit.auditType || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">Risk Rating</p>
                  {lastAudit.overallRiskRating ? (
                    <Badge
                      className={getRiskRatingColor(
                        lastAudit.overallRiskRating,
                      )}
                    >
                      {lastAudit.overallRiskRating.replace("_", " ")}
                    </Badge>
                  ) : (
                    <p className="text-muted-foreground text-sm">N/A</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground text-sm">Start Date</p>
                  <p className="font-medium">
                    {lastAudit.actualStartDate
                      ? formatDate(lastAudit.actualStartDate)
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm">End Date</p>
                  <p className="font-medium">
                    {lastAudit.actualEndDate
                      ? formatDate(lastAudit.actualEndDate)
                      : "N/A"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md p-4 text-sm">
              <AlertCircle className="h-4 w-4" />
              No prior audit found
            </div>
          )}
        </CardContent>
      </Card>

      {/* RAM Score Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            RAM Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ramBreakdown.compositeScore > 0 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-muted-foreground text-sm">
                    Composite Score
                  </p>
                  <p className="text-3xl font-bold">
                    {ramBreakdown.compositeScore.toFixed(2)}
                  </p>
                </div>
                {ramBreakdown.riskCategory && (
                  <Badge
                    className={
                      ramBreakdown.riskCategory === "HIGH"
                        ? "bg-red-100 text-red-800"
                        : ramBreakdown.riskCategory === "MEDIUM"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-green-100 text-green-800"
                    }
                  >
                    {ramBreakdown.riskCategory}
                  </Badge>
                )}
              </div>

              {ramBreakdown.assessmentYear && (
                <div>
                  <p className="text-muted-foreground text-sm">
                    Assessment Year
                  </p>
                  <p className="font-medium">{ramBreakdown.assessmentYear}</p>
                </div>
              )}

              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium">Business Risk Score</p>
                    <p className="text-sm font-semibold">
                      {ramBreakdown.businessRiskScore.toFixed(2)}
                    </p>
                  </div>
                  <Progress
                    value={(ramBreakdown.businessRiskScore / 5) * 100}
                    className="h-2"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium">Control Risk Score</p>
                    <p className="text-sm font-semibold">
                      {ramBreakdown.controlRiskScore.toFixed(2)}
                    </p>
                  </div>
                  <Progress
                    value={(ramBreakdown.controlRiskScore / 5) * 100}
                    className="h-2"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md p-4 text-sm">
              <AlertCircle className="h-4 w-4" />
              RAM assessment pending
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prior Findings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Prior Findings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {findingsSummary.bySeverity.length > 0 ||
          findingsSummary.topFindings.length > 0 ? (
            <div className="space-y-4">
              {/* Findings count by severity */}
              {findingsSummary.bySeverity.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">By Severity</p>
                  <div className="flex flex-wrap gap-2">
                    {findingsSummary.bySeverity.map((item) => (
                      <Badge
                        key={item.severity}
                        className={getSeverityColor(item.severity)}
                      >
                        {item.severity}: {item.count}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Top findings list */}
              {findingsSummary.topFindings.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">
                    Recent High/Critical Findings
                  </p>
                  <div className="space-y-2">
                    {findingsSummary.topFindings.map((finding) => (
                      <div
                        key={finding.id}
                        className="rounded-md border p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="flex-1 font-medium">{finding.title}</p>
                          <Badge className={getSeverityColor(finding.severity)}>
                            {finding.severity}
                          </Badge>
                        </div>
                        <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                          <span>{finding.status}</span>
                          <span>•</span>
                          <span>{formatDate(finding.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md p-4 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              No prior findings
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Status Card */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            Compliance Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {complianceSummary.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {complianceSummary.map((item) => (
                <div
                  key={item.status}
                  className="rounded-lg border p-4 text-center"
                >
                  <div className="mb-2">
                    <Badge className={getComplianceStatusColor(item.status)}>
                      {item.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                  <p className="text-2xl font-bold">{item.count}</p>
                  <p className="text-muted-foreground text-xs">items</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-muted text-muted-foreground flex items-center gap-2 rounded-md p-4 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              No compliance items
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
