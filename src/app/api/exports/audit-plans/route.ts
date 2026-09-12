import { NextResponse } from "next/server";
import { getRequiredSession } from "@/data-access/session";
import { getExportAuditPlans } from "@/data-access/exports";
import { prismaForTenant } from "@/lib/prisma";
import {
  createWorkbook,
  addHeaders,
  addDataRows,
  autoFitColumns,
  mergeHeaderRows,
  toBuffer,
  formatDateIndian,
} from "@/lib/excel-export";

export const dynamic = "force-dynamic";

const COLUMNS = [
  { header: "Plan Period", key: "planPeriod", width: 22 },
  { header: "Plan Status", key: "planStatus", width: 14 },
  { header: "Branch", key: "branch", width: 20 },
  { header: "Audit Area", key: "auditArea", width: 20 },
  { header: "Engagement Status", key: "engagementStatus", width: 18 },
  { header: "Start Date", key: "startDate", width: 14 },
  { header: "End Date", key: "endDate", width: 14 },
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

    const data = await getExportAuditPlans(session);

    // Format dates
    const formatted = data.map((row) => ({
      ...row,
      startDate: formatDateIndian(row.startDate as Date | string | null),
      endDate: formatDateIndian(row.endDate as Date | string | null),
    }));

    const { workbook, sheet, dataStartRow } = createWorkbook({
      bankName: tenantName,
      exportType: "Audit Plans Export",
      sheetName: "Audit Plans",
    });

    const nextRow = addHeaders(sheet, COLUMNS, dataStartRow);
    addDataRows(sheet, formatted, COLUMNS, nextRow);

    mergeHeaderRows(sheet, COLUMNS.length);
    autoFitColumns(sheet, COLUMNS);

    const buffer = await toBuffer(workbook);
    const dateStr = new Date().toISOString().slice(0, 10);

    return new NextResponse(Buffer.from(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="audit-plans-export-${dateStr}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Audit plans export error:", error);
    return NextResponse.json(
      { error: "Failed to generate audit plans export" },
      { status: 500 },
    );
  }
}
