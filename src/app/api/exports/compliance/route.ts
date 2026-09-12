import { NextResponse } from "next/server";
import { getRequiredSession } from "@/data-access/session";
import { getExportCompliance } from "@/data-access/exports";
import { prismaForTenant } from "@/lib/prisma";
import {
  createWorkbook,
  addHeaders,
  addDataRows,
  applyStatusColor,
  autoFitColumns,
  mergeHeaderRows,
  toBuffer,
  formatDateIndian,
} from "@/lib/excel-export";

export const dynamic = "force-dynamic";

const COLUMNS = [
  { header: "ID", key: "id", width: 12 },
  { header: "Requirement", key: "requirement", width: 50 },
  { header: "Category", key: "category", width: 20 },
  { header: "Status", key: "status", width: 16 },
  { header: "RBI Circular Ref", key: "rbiCircularRef", width: 35 },
  { header: "Owner", key: "owner", width: 20 },
  { header: "Next Review Date", key: "nextReviewDate", width: 16 },
  { header: "Notes", key: "notApplicableReason", width: 30 },
];

export async function GET() {
  try {
    const session = await getRequiredSession();
    const { tenantId } = session.user;
    const tenant = await prismaForTenant(tenantId).tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });
    const tenantName = tenant?.name ?? "AEGIS Audit Platform";

    const data = await getExportCompliance(session);

    if (data === null) {
      return NextResponse.json(
        { error: "Insufficient permissions. CAE, CCO, or CEO role required." },
        { status: 403 },
      );
    }

    // Format dates
    const formatted = data.map((row) => ({
      ...row,
      nextReviewDate: formatDateIndian(row.nextReviewDate),
    }));

    const { workbook, sheet, dataStartRow } = createWorkbook({
      bankName: tenantName,
      exportType: "Compliance Export",
      sheetName: "Compliance",
    });

    const nextRow = addHeaders(sheet, COLUMNS, dataStartRow);
    addDataRows(sheet, formatted, COLUMNS, nextRow);

    // Apply status color-coding to status column (column 4)
    const statusColIndex = 4;
    for (let i = 0; i < formatted.length; i++) {
      const cell = sheet.getRow(nextRow + i).getCell(statusColIndex);
      applyStatusColor(cell, formatted[i].status);
    }

    mergeHeaderRows(sheet, COLUMNS.length);
    autoFitColumns(sheet, COLUMNS);

    const buffer = await toBuffer(workbook);
    const dateStr = new Date().toISOString().slice(0, 10);

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="compliance-export-${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Compliance export error:", error);
    return NextResponse.json(
      { error: "Failed to generate compliance export" },
      { status: 500 },
    );
  }
}
