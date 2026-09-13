"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import {
  getAuditReportData,
  getEngagementModuleSections,
} from "@/data-access/reports";
import { generateAuditReportXLSX } from "@/lib/excel-export/audit-report-generator";
import { buildModuleSheetRows } from "@/lib/excel-export/generic-module-sheet";
import { prismaForTenant } from "@/data-access/prisma";
import { uploadToS3 } from "@/lib/s3";
import { GenerateReportSchema, type GenerateReportInput } from "./schemas";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";

type AuditReportData = NonNullable<
  Awaited<ReturnType<typeof getAuditReportData>>
>;

function getUniqueWorksheetName(
  desiredName: string,
  usedNames: Set<string>,
): string {
  const normalized = desiredName.trim() || "Module";
  const baseName = normalized.slice(0, 31);

  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return baseName;
  }

  let suffix = 2;
  while (suffix < 1000) {
    const suffixText = ` (${suffix})`;
    const candidate = `${normalized.slice(0, 31 - suffixText.length)}${suffixText}`;
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    suffix++;
  }

  throw new Error("Unable to allocate a unique worksheet name.");
}

async function buildGenericRbiaWorkbook(
  auditData: AuditReportData,
  engagementId: string,
  modules: Awaited<ReturnType<typeof getEngagementModuleSections>>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AEGIS Audit System";
  workbook.created = new Date();
  workbook.modified = new Date();
  const usedSheetNames = new Set<string>();

  const summarySheet = workbook.addWorksheet("RBIA Summary");
  usedSheetNames.add("RBIA Summary");
  summarySheet.addRow(["Internal Audit Report"]);
  summarySheet.addRow(["Engagement ID", engagementId]);
  summarySheet.addRow(["Audit Number", auditData.auditNumber ?? "N/A"]);
  summarySheet.addRow([
    "Branch",
    auditData.branch ? `${auditData.branch.name} (${auditData.branch.code})` : "N/A",
  ]);
  summarySheet.addRow(["Audit Type", auditData.auditType ?? "RBIA"]);
  summarySheet.addRow([
    "Period",
    auditData.periodFrom && auditData.periodTo
      ? `${new Date(auditData.periodFrom).toLocaleDateString("en-IN")} to ${new Date(auditData.periodTo).toLocaleDateString("en-IN")}`
      : "N/A",
  ]);
  summarySheet.addRow([
    "Overall Risk Rating",
    auditData.overallRiskRating ?? "Not Computed",
  ]);
  summarySheet.addRow(["Modules Covered", modules.length]);
  summarySheet.getRow(1).font = { bold: true, size: 16 };
  summarySheet.getColumn(1).width = 24;
  summarySheet.getColumn(2).width = 48;

  for (const section of modules) {
    const sheet = workbook.addWorksheet(
      getUniqueWorksheetName(section.moduleName, usedSheetNames),
    );
    const rows = buildModuleSheetRows(section);

    rows.forEach((row) => {
      sheet.addRow(row);
    });

    sheet.getRow(1).font = { bold: true, size: 12 };
    sheet.getRow(2).font = { bold: true };
    sheet.getColumn(1).width = 18;
    sheet.getColumn(2).width = 72;
    sheet.getColumn(3).width = 24;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/**
 * Generate XLSX audit report and upload to S3.
 * Security: Requires report:generate permission.
 * Side effects: Uploads file to S3, stores S3 key in database (future: link to engagement).
 * R32: Supports optional templateId for custom report formatting.
 */
export async function generateXlsxReport(input: GenerateReportInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "report:generate")) {
    return {
      success: false as const,
      error: "You do not have permission to generate reports.",
    };
  }

  const parsed = GenerateReportSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0].message,
    };
  }

  try {
    // Fetch template if specified (R32)
    let templateData: Record<string, any> | null = null;
    if (parsed.data.templateId) {
      const db = prismaForTenant(tenantId);
      const template = await db.reportTemplate.findFirst({
        where: { id: parsed.data.templateId, tenantId, isActive: true },
      });
      if (template) {
        templateData = template.templateData as Record<string, any>;
      }
    }

    // Fetch audit data
    const auditData = await getAuditReportData(
      session,
      parsed.data.engagementId,
    );

    if (!auditData) {
      return {
        success: false as const,
        error: "Audit engagement not found.",
      };
    }

    // R29: Allow draft/in-progress reports (not just COMPLETED)
    const isDraft = auditData.status !== "COMPLETED";
    const isRbia = auditData.auditType === "RBIA";

    // Generate XLSX
    logger.info(
      { engagementId: parsed.data.engagementId, isDraft, isRbia },
      "Generating XLSX audit report",
    );

    const buffer = isRbia
      ? await buildGenericRbiaWorkbook(
          auditData,
          parsed.data.engagementId,
          await getEngagementModuleSections(session, parsed.data.engagementId),
        )
      : await generateAuditReportXLSX(auditData, templateData ?? undefined);

    // Upload to S3
    const statusTag = isDraft ? "_DRAFT" : "";
    const filename = `audit-reports/${tenantId}/${auditData.auditNumber || auditData.id}${statusTag}_report.xlsx`;
    const s3Key = await uploadToS3({
      key: filename,
      body: buffer,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    logger.info(
      { engagementId: parsed.data.engagementId, s3Key },
      "XLSX report uploaded to S3",
    );

    // R29: Track generated report in BoardReport for audit trail + re-download
    const db = prismaForTenant(tenantId);
    const now = new Date();
    // Fiscal quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
    const month = now.getMonth(); // 0-indexed
    const fiscalQuarter =
      month >= 3 && month <= 5
        ? "Q1_APR_JUN"
        : month >= 6 && month <= 8
          ? "Q2_JUL_SEP"
          : month >= 9 && month <= 11
            ? "Q3_OCT_DEC"
            : "Q4_JAN_MAR";
    const quarterEnum = fiscalQuarter as any;
    await withAuditedMutation(
      userActor(session),
      "board_report.generated",
      (tx) =>
        tx.boardReport.create({
          data: {
            tenantId,
            year: now.getFullYear(),
            quarter: quarterEnum,
            title: `XLSX Audit Report — ${auditData.auditNumber || auditData.id}${isDraft ? " (DRAFT)" : ""}`,
            s3Key,
            fileSize: buffer.length,
            generatedById: session.user.id,
          },
        }),
    );

    revalidatePath(`/audit-plans/${parsed.data.engagementId}`);
    revalidatePath("/reports");

    return {
      success: true as const,
      data: {
        engagementId: parsed.data.engagementId,
        s3Key,
        filename: `${auditData.auditNumber || auditData.id}${statusTag}_report.xlsx`,
        isDraft,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate XLSX report.";
    logger.error({ error, action: "generate_xlsx_report", tenantId }, message);
    return { success: false as const, error: message };
  }
}
