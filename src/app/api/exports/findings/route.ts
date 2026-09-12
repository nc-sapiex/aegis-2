import { NextResponse } from "next/server";
import { getRequiredSession } from "@/data-access/session";
import { getExportFindings } from "@/data-access/exports";
import { prismaForTenant } from "@/lib/prisma";
import {
  createWorkbook,
  addHeaders,
  addDataRows,
  applySeverityColor,
  autoFitColumns,
  mergeHeaderRows,
  toBuffer,
  formatDateIndian,
} from "@/lib/excel-export";

export const dynamic = "force-dynamic";

const COLUMNS = [
  { header: "ID", key: "id", width: 12 },
  { header: "Title", key: "title", width: 40 },
  { header: "Severity", key: "severity", width: 12 },
  { header: "Status", key: "status", width: 14 },
  { header: "Branch", key: "branch", width: 20 },
  { header: "Risk Category", key: "riskCategory", width: 18 },
  { header: "Due Date", key: "dueDate", width: 14 },
  { header: "Assigned To", key: "assignedTo", width: 20 },
  { header: "Created Date", key: "createdAt", width: 14 },
  { header: "Responses", key: "responseCount", width: 12 },
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

    const data = await getExportFindings(session);

    // Format dates for display
    const formatted = data.map((row) => ({
      ...row,
      dueDate: formatDateIndian(row.dueDate),
      createdAt: formatDateIndian(row.createdAt),
    }));

    const { workbook, sheet, dataStartRow } = createWorkbook({
      bankName: tenantName,
      exportType: "Findings Export",
      sheetName: "Findings",
    });

    const nextRow = addHeaders(sheet, COLUMNS, dataStartRow);
    addDataRows(sheet, formatted, COLUMNS, nextRow);

    // Apply severity color-coding to severity column (column 3)
    const severityColIndex = 3;
    for (let i = 0; i < formatted.length; i++) {
      const cell = sheet.getRow(nextRow + i).getCell(severityColIndex);
      applySeverityColor(cell, formatted[i].severity);
    }

    mergeHeaderRows(sheet, COLUMNS.length);
    autoFitColumns(sheet, COLUMNS);

    const buffer = await toBuffer(workbook);
    const dateStr = new Date().toISOString().slice(0, 10);

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="findings-export-${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Findings export error:", error);
    return NextResponse.json(
      { error: "Failed to generate findings export" },
      { status: 500 },
    );
  }
}
