"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { getAuditReportData } from "@/data-access/reports";
import { generateAuditReportXLSX } from "@/lib/excel-export/audit-report-generator";
import { prismaForTenant } from "@/data-access/prisma";
import { uploadToS3 } from "@/lib/s3";
import { GenerateReportSchema, type GenerateReportInput } from "./schemas";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";

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

    // Generate XLSX
    logger.info(
      { engagementId: parsed.data.engagementId, isDraft },
      "Generating XLSX audit report",
    );

    // R32: Pass template data to generator for custom formatting
    const buffer = await generateAuditReportXLSX(
      auditData,
      templateData ?? undefined,
    );

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
