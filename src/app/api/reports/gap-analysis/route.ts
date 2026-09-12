import { NextResponse } from "next/server";
import { getRequiredSession } from "@/data-access/session";
import { prismaForTenant } from "@/data-access/prisma";
import {
  createWorkbook,
  addHeaders,
  addDataRows,
  applySeverityColor,
  autoFitColumns,
  mergeHeaderRows,
  toBuffer,
} from "@/lib/excel-export";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  CBS: "Core Banking System",
  CHANNELS: "Channels (ATM, Mobile, Internet)",
  ACCESS_CONTROL: "Access Control & Authentication",
  BCP_DR: "Business Continuity & DR",
  VENDOR: "Vendor Management",
  CHANGE_MGMT: "Change Management",
  CYBER_SECURITY: "Cyber Security",
  INVESTMENT_CERTIFICATION: "Investment Certification",
};

// ─── Column definitions ────────────────────────────────────────────────────

const SUMMARY_COLUMNS = [
  { header: "Category", key: "category", width: 30 },
  { header: "Checklist", key: "checklist", width: 35 },
  { header: "Total Items", key: "total", width: 14 },
  { header: "Compliant", key: "compliant", width: 14 },
  { header: "Non-Compliant", key: "nonCompliant", width: 16 },
  { header: "Partial", key: "partial", width: 14 },
  { header: "Compliance %", key: "complianceRate", width: 14 },
  { header: "Overall Rating", key: "rating", width: 16 },
];

const DETAIL_COLUMNS = [
  { header: "Category", key: "category", width: 25 },
  { header: "Control Item", key: "item", width: 50 },
  { header: "Status", key: "status", width: 16 },
  { header: "Risk Level", key: "riskLevel", width: 14 },
  { header: "Evidence", key: "evidence", width: 30 },
  { header: "Remarks", key: "remarks", width: 30 },
];

const REMEDIATION_COLUMNS = [
  { header: "Category", key: "category", width: 25 },
  { header: "Control Item", key: "item", width: 50 },
  { header: "Risk Level", key: "riskLevel", width: 14 },
  { header: "Current Status", key: "status", width: 16 },
  { header: "Evidence Status", key: "evidenceStatus", width: 16 },
  { header: "Remediation Notes", key: "remarks", width: 35 },
];

/**
 * GET /api/reports/gap-analysis
 *
 * Generate XLSX gap analysis report from IS audit checklists (R104).
 * Three sheets: Gap Summary, Gap Detail, Remediation Tracker.
 */
export async function GET() {
  try {
    const session = await getRequiredSession();
    const { tenantId } = session.user;
    const userRoles = session.user.roles as string[];

    // Permission check — IS auditor, CAE, or CCO
    if (
      !userRoles.some((r) =>
        ["IS_AUDITOR", "CAE", "CCO", "SYSTEM_ADMIN"].includes(r),
      )
    ) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const db = prismaForTenant(tenantId);

    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const bankName = tenant?.name ?? "AEGIS Audit Platform";

    // Fetch all IS audit checklists
    const checklists = await db.isAuditChecklist.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    // ─── Sheet 1: Gap Summary ────────────────────────────────────────────

    const summaryData = checklists.map((cl) => {
      const items = Array.isArray(cl.items) ? (cl.items as any[]) : [];
      const total = items.length;
      const compliant = items.filter(
        (i: any) => i.response === "COMPLIANT",
      ).length;
      const nonCompliant = items.filter(
        (i: any) => i.response === "NON_COMPLIANT",
      ).length;
      const partial = items.filter((i: any) => i.response === "PARTIAL").length;
      const responded =
        total -
        items.filter((i: any) => !i.response || i.response === "NOT_APPLICABLE")
          .length;
      const complianceRate =
        responded > 0 ? `${Math.round((compliant / responded) * 100)}%` : "N/A";

      return {
        category: CATEGORY_LABELS[cl.category] ?? cl.category,
        checklist: cl.checklistName,
        total,
        compliant,
        nonCompliant,
        partial,
        complianceRate,
        rating: cl.overallRating ?? "Pending",
      };
    });

    const {
      workbook,
      sheet: summarySheet,
      dataStartRow,
    } = createWorkbook({
      bankName,
      exportType: "IS Audit Gap Analysis Report",
      sheetName: "Gap Summary",
    });

    let nextRow = addHeaders(summarySheet, SUMMARY_COLUMNS, dataStartRow);
    addDataRows(summarySheet, summaryData, SUMMARY_COLUMNS, nextRow);
    mergeHeaderRows(summarySheet, SUMMARY_COLUMNS.length);
    autoFitColumns(summarySheet, SUMMARY_COLUMNS);

    // ─── Sheet 2: Gap Detail ─────────────────────────────────────────────

    const detailSheet = workbook.addWorksheet("Gap Detail");
    const detailData: any[] = [];

    for (const cl of checklists) {
      const items = Array.isArray(cl.items) ? (cl.items as any[]) : [];
      for (const item of items) {
        if (item.response === "NON_COMPLIANT" || item.response === "PARTIAL") {
          const question = item.question ?? item.id ?? "Unknown";
          const lowerQ = question.toLowerCase();

          let riskLevel = "MEDIUM";
          if (
            lowerQ.includes("critical") ||
            lowerQ.includes("encryption") ||
            cl.category === "CBS"
          ) {
            riskLevel = "CRITICAL";
          } else if (
            lowerQ.includes("password") ||
            lowerQ.includes("authentication") ||
            cl.category === "ACCESS_CONTROL"
          ) {
            riskLevel = "HIGH";
          }

          detailData.push({
            category: CATEGORY_LABELS[cl.category] ?? cl.category,
            item: question,
            status: item.response,
            riskLevel,
            evidence: item.evidence ?? "",
            remarks: item.remarks ?? "",
          });
        }
      }
    }

    nextRow = addHeaders(detailSheet, DETAIL_COLUMNS, 1);
    addDataRows(detailSheet, detailData, DETAIL_COLUMNS, nextRow);

    // Apply risk level coloring (column 4)
    for (let i = 0; i < detailData.length; i++) {
      const cell = detailSheet.getRow(nextRow + i).getCell(4);
      applySeverityColor(cell, detailData[i].riskLevel);
    }

    autoFitColumns(detailSheet, DETAIL_COLUMNS);

    // ─── Sheet 3: Remediation Tracker ────────────────────────────────────

    const remediationSheet = workbook.addWorksheet("Remediation Tracker");
    const remediationData = detailData.map((d) => ({
      ...d,
      evidenceStatus: d.evidence ? "Collected" : "Pending",
    }));

    nextRow = addHeaders(remediationSheet, REMEDIATION_COLUMNS, 1);
    addDataRows(
      remediationSheet,
      remediationData,
      REMEDIATION_COLUMNS,
      nextRow,
    );
    autoFitColumns(remediationSheet, REMEDIATION_COLUMNS);

    // ─── Generate buffer and return ──────────────────────────────────────

    const buffer = await toBuffer(workbook);
    const dateStr = new Date().toISOString().slice(0, 10);

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="gap-analysis-${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Gap analysis export error:", error);
    return NextResponse.json(
      { error: "Failed to generate gap analysis report" },
      { status: 500 },
    );
  }
}
