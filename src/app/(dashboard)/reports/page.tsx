import { getRequiredSession } from "@/data-access/session";
import { getReportTemplates } from "@/data-access/analytics";
import { getGeneratedReports } from "@/data-access/reports";
import { ReportGenerator } from "@/components/reports/report-generator";
import { GeneratedReportsList } from "@/components/reports/generated-reports-list";
import { hasPermission, type Role } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, FileSpreadsheet, Download, ExternalLink } from "@/lib/icons";
import Link from "next/link";

export default async function ReportsPage() {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  const canRead = hasPermission(userRoles, "report:read");
  const canGenerate = hasPermission(userRoles, "report:generate");

  if (!canRead) {
    redirect("/dashboard");
  }

  const templates = await getReportTemplates(tenantId);

  // R29: Fetch generated report history for re-download
  const generatedReports = await getGeneratedReports(session);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">
            Generate audit reports, compliance summaries, and board reports
          </p>
          <div className="flex gap-4 pt-1">
            <Link
              href="/findings"
              className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
            >
              View Findings
              <ExternalLink className="h-3 w-3" />
            </Link>
            <Link
              href="/compliance"
              className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
            >
              View Compliance
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-blue-50 p-2">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold">XLSX Reports</p>
              <p className="text-muted-foreground text-sm">
                Detailed audit data export
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-red-50 p-2">
              <FileText className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="font-semibold">PDF Summaries</p>
              <p className="text-muted-foreground text-sm">
                Executive summary reports
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-green-50 p-2">
              <Download className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="font-semibold">Templates</p>
              <p className="text-muted-foreground text-sm">
                {templates.length} available
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Report generation UI */}
      <ReportGenerator canGenerate={canGenerate} templates={templates} />

      {/* R29: Generated report history with re-download */}
      <GeneratedReportsList reports={generatedReports} />
    </div>
  );
}
