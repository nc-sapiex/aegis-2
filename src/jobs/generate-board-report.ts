import crypto from "node:crypto";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { prismaSystem } from "@/lib/prisma";
import { aggregateReportData, createBoardReport } from "@/data-access/reports";
import { BoardReport } from "@/components/pdf-report/board-report";
import { uploadToS3 } from "@/lib/s3";
import type { AuthSession } from "@/lib/auth";

export interface GenerateBoardReportPayload {
  tenantId: string;
  year: number;
  quarter: string;
  requestedById: string;
  executiveCommentary?: string;
}

/**
 * System-triggered entry point into the same board-report generation
 * pipeline `src/app/api/reports/board-report/route.ts`'s POST handler uses
 * interactively. A pg-boss job has no session, so this builds a
 * session-shaped object for `requestedById` before calling into the DAL —
 * see the route for the aggregate → render → upload → record sequence this
 * mirrors exactly.
 */
export async function processGenerateBoardReport(
  payload: GenerateBoardReportPayload,
): Promise<{ s3Key: string }> {
  const { tenantId, year, quarter, requestedById, executiveCommentary } =
    payload;

  const user = await prismaSystem.user.findUnique({
    where: { id: requestedById },
    select: { id: true, tenantId: true, roles: true },
  });
  if (!user || user.tenantId !== tenantId) {
    throw new Error(
      `generate-board-report: requestedById ${requestedById} not found in tenant ${tenantId}`,
    );
  }

  const session = {
    user: { id: user.id, tenantId: user.tenantId, roles: user.roles },
    session: { id: `job-${Date.now()}` },
  } as AuthSession;

  const data = await aggregateReportData(
    session,
    year,
    quarter,
    executiveCommentary,
  );
  if (!data) {
    throw new Error(
      `generate-board-report: user ${requestedById} lacks report access (CAE/CCO/CEO required)`,
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(
    React.createElement(BoardReport, { data }) as any,
  );

  const s3Key = `${tenantId}/reports/${year}/${quarter}/${crypto.randomUUID()}.pdf`;
  await uploadToS3({
    key: s3Key,
    body: pdfBuffer,
    contentType: "application/pdf",
  });

  const metricsSnapshot = {
    complianceScore: data.complianceOverallScore,
    totalFindings: data.executiveSummary.totalFindings,
    criticalFindings: data.executiveSummary.criticalFindings,
    auditCompletionRate: data.executiveSummary.auditCompletionRate,
    riskLevel: data.executiveSummary.riskLevel,
  };

  await createBoardReport(session, {
    year,
    quarter,
    executiveCommentary,
    s3Key,
    fileSize: pdfBuffer.length,
    metricsSnapshot,
  });

  return { s3Key };
}
