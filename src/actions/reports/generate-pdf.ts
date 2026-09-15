"use server";

import React from "react";
import { revalidatePath } from "next/cache";
import { renderToBuffer } from "@react-pdf/renderer";
import { getRequiredSession } from "@/data-access/session";
import { hasPermission, type Role } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { getAuditReportData } from "@/data-access/reports";
import { AuditSummaryDocument } from "@/components/pdf-report/audit-summary-document";
import { GenericRbiaReportDocument } from "@/components/pdf-report/generic-rbia-report-document";
import { reportModuleToSection } from "@/lib/reporting/module-section";
import { uploadToS3 } from "@/lib/s3";
import { prismaForTenant } from "@/data-access/prisma";
import { GenerateReportSchema, type GenerateReportInput } from "./schemas";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";

/**
 * Generate PDF summary report and upload to S3.
 * Security: Requires report:generate permission.
 * R32: Supports optional templateId for custom report formatting.
 */
export async function generatePdfReport(input: GenerateReportInput) {
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

    // Render PDF — RBIA engagements get the data-driven GenericRbiaReportDocument
    logger.info(
      { engagementId: parsed.data.engagementId, isDraft, isRbia },
      `Generating PDF ${isRbia ? "RBIA" : "audit summary"} report`,
    );

    let pdfBuffer: Buffer;
    let reportLabel: string;

    if (isRbia) {
      const modules = auditData.modules.map(reportModuleToSection);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(
        React.createElement(GenericRbiaReportDocument, {
          auditData,
          modules,
        }) as any,
      );
      pdfBuffer = Buffer.from(buffer);
      reportLabel = "rbia";
    } else {
      // Legacy audit — use existing AuditSummaryDocument
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const buffer = await renderToBuffer(
        React.createElement(AuditSummaryDocument, { auditData }) as any,
      );
      pdfBuffer = Buffer.from(buffer);
      reportLabel = "summary";
    }

    // Upload to S3
    const statusTag = isDraft ? "_DRAFT" : "";
    const filename = `audit-reports/${tenantId}/${auditData.auditNumber || auditData.id}${statusTag}_${reportLabel}.pdf`;
    const s3Key = await uploadToS3({
      key: filename,
      body: pdfBuffer,
      contentType: "application/pdf",
    });

    logger.info(
      { engagementId: parsed.data.engagementId, s3Key, isRbia },
      `PDF ${isRbia ? "RBIA" : "summary"} report uploaded to S3`,
    );

    // R29: Track generated report in BoardReport for audit trail + re-download
    const db = prismaForTenant(tenantId);
    const now = new Date();
    const month = now.getMonth();
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
            title: `${isRbia ? "RBIA Report" : "PDF Summary"} — ${auditData.auditNumber || auditData.id}${isDraft ? " (DRAFT)" : ""}`,
            s3Key,
            fileSize: pdfBuffer.length,
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
        filename: `${auditData.auditNumber || auditData.id}${statusTag}_${reportLabel}.pdf`,
        isDraft,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate PDF report.";
    logger.error({ error, action: "generate_pdf_report", tenantId }, message);
    return { success: false as const, error: message };
  }
}
