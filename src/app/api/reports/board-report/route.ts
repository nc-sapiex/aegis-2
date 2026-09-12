import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { getRequiredSession } from "@/data-access/session";
import {
  aggregateReportData,
  createBoardReport,
  getBoardReportById,
} from "@/data-access/reports";
import { BoardReport } from "@/components/pdf-report/board-report";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { generateDownloadUrl } from "@/lib/s3";
import { verifyCsrf } from "@/lib/csrf";
import crypto from "node:crypto";
import React from "react";

export const dynamic = "force-dynamic";

const s3Client = new S3Client({ region: "ap-south-1" });
const BUCKET = process.env.S3_BUCKET_NAME ?? "aegis-evidence-dev";

/**
 * POST /api/reports/board-report
 *
 * Generate a PDF board report, store in S3, create audit trail record.
 * Body: { year: number, quarter: string, executiveCommentary?: string }
 */
export async function POST(request: NextRequest) {
  try {
    await verifyCsrf();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const session = await getRequiredSession();
    const roles = session.user.roles;

    // Only CAE can generate reports
    if (!roles.includes("CAE")) {
      return NextResponse.json(
        { error: "Only CAE can generate board reports" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { year, quarter, executiveCommentary } = body as {
      year: number;
      quarter: string;
      executiveCommentary?: string;
    };

    if (!year || !quarter) {
      return NextResponse.json(
        { error: "year and quarter are required" },
        { status: 400 },
      );
    }

    // Aggregate data
    const data = await aggregateReportData(
      session,
      year,
      quarter,
      executiveCommentary,
    );

    if (!data) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    // Render PDF
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(
      React.createElement(BoardReport, { data }) as any,
    );

    // Store in S3
    const tenantId = session.user.tenantId;
    const reportId = crypto.randomUUID();
    const s3Key = `${tenantId}/reports/${year}/${quarter}/${reportId}.pdf`;

    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: s3Key,
        Body: pdfBuffer,
        ContentType: "application/pdf",
        ServerSideEncryption: "AES256",
      }),
    );

    // Create audit trail record
    const metricsSnapshot = {
      complianceScore: data.complianceOverallScore,
      totalFindings: data.executiveSummary.totalFindings,
      criticalFindings: data.executiveSummary.criticalFindings,
      auditCompletionRate: data.executiveSummary.auditCompletionRate,
      riskLevel: data.executiveSummary.riskLevel,
    };

    const record = await createBoardReport(session, {
      year,
      quarter,
      executiveCommentary,
      s3Key,
      fileSize: pdfBuffer.length,
      metricsSnapshot,
    });

    // Return PDF as download
    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `board-report-${quarter}-FY${year}-${dateStr}.pdf`;

    // Convert Buffer to Uint8Array for NextResponse compatibility
    const responseBody = new Uint8Array(pdfBuffer) as unknown as BodyInit;

    return new NextResponse(responseBody, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Report-Id": record.id,
      },
    });
  } catch (error) {
    console.error("Board report generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate board report" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/reports/board-report?id=<reportId>
 *
 * Get presigned download URL for a previously generated report.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getRequiredSession();
    const roles = session.user.roles;

    if (!roles.some((r) => ["CAE", "CCO", "CEO"].includes(r))) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 },
      );
    }

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Report id is required" },
        { status: 400 },
      );
    }

    const report = await getBoardReportById(session, id);
    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (!report.s3Key) {
      return NextResponse.json(
        { error: "Report file not available" },
        { status: 404 },
      );
    }

    const downloadUrl = await generateDownloadUrl(report.s3Key);

    return NextResponse.json({
      id: report.id,
      title: report.title,
      downloadUrl,
      generatedAt: report.generatedAt,
      generatedBy: (report as any).generatedBy?.name,
    });
  } catch (error) {
    console.error("Board report download error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve report" },
      { status: 500 },
    );
  }
}
