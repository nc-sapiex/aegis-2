import "server-only";
import ExcelJS from "exceljs";

// ─── Types ──────────────────────────────────────────────────────────────────

interface CreateWorkbookOptions {
  bankName: string;
  exportType: string;
  sheetName: string;
}

interface ColumnDef {
  header: string;
  key: string;
  width?: number;
}

// ─── Severity Colors ────────────────────────────────────────────────────────

const SEVERITY_FILL: Record<string, string> = {
  CRITICAL: "FEE2E2",
  HIGH: "FED7AA",
  MEDIUM: "FEF3C7",
  LOW: "D1FAE5",
};

const STATUS_FILL: Record<string, string> = {
  COMPLIANT: "D1FAE5",
  NON_COMPLIANT: "FEE2E2",
  PARTIAL: "FEF3C7",
  PENDING: "E2E8F0",
};

// ─── Date Formatting ────────────────────────────────────────────────────────

export function formatDateIndian(
  date: Date | string | null | undefined,
): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// ─── Create Workbook ────────────────────────────────────────────────────────

/**
 * Create an ExcelJS workbook with standard AEGIS header rows:
 * Row 1: Bank name (bold, 14pt, merged)
 * Row 2: Export type and date
 * Row 3: CONFIDENTIAL notice (red, italic)
 * Row 4: Empty spacer
 *
 * @returns workbook, sheet, and the row number where data headers should start (5)
 */
export function createWorkbook({
  bankName,
  exportType,
  sheetName,
}: CreateWorkbookOptions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AEGIS Audit Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);

  // Row 1: Bank name
  const row1 = sheet.getRow(1);
  row1.getCell(1).value = bankName;
  row1.getCell(1).font = { bold: true, size: 14 };
  row1.height = 24;

  // Row 2: Export type and date
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const row2 = sheet.getRow(2);
  row2.getCell(1).value = `${exportType} — ${dateStr}`;
  row2.getCell(1).font = { size: 11, color: { argb: "FF4B5563" } };

  // Row 3: Confidentiality notice
  const row3 = sheet.getRow(3);
  row3.getCell(1).value = "CONFIDENTIAL — For Internal Use Only";
  row3.getCell(1).font = {
    italic: true,
    color: { argb: "FFDC2626" },
    size: 10,
  };

  // Row 4: Spacer (empty)

  return { workbook, sheet, dataStartRow: 5 };
}

// ─── Add Headers ────────────────────────────────────────────────────────────

/**
 * Add column headers with dark background, white bold text, and auto-filter.
 */
export function addHeaders(
  sheet: ExcelJS.Worksheet,
  columns: ColumnDef[],
  startRow: number,
) {
  // Set column definitions
  sheet.columns = columns.map((col) => ({
    key: col.key,
    width: col.width ?? 18,
  }));

  const headerRow = sheet.getRow(startRow);

  columns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    cell.border = {
      bottom: { style: "thin", color: { argb: "FF374151" } },
    };
  });

  headerRow.height = 22;

  // Enable auto-filter
  sheet.autoFilter = {
    from: { row: startRow, column: 1 },
    to: { row: startRow, column: columns.length },
  };

  return startRow + 1;
}

// ─── Add Data Rows ──────────────────────────────────────────────────────────

/**
 * Add data rows with alternating colors (white / light gray).
 */
export function addDataRows(
  sheet: ExcelJS.Worksheet,
  data: Record<string, unknown>[],
  columns: ColumnDef[],
  startRow: number,
) {
  data.forEach((record, index) => {
    const row = sheet.getRow(startRow + index);

    columns.forEach((col, colIndex) => {
      const cell = row.getCell(colIndex + 1);
      cell.value = record[col.key] as ExcelJS.CellValue;
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", wrapText: true };
    });

    // Alternating row colors
    if (index % 2 === 1) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF9FAFB" },
        };
      });
    }

    row.height = 18;
  });

  return startRow + data.length;
}

// ─── Cell Formatting Helpers ────────────────────────────────────────────────

/**
 * Apply severity-based background color to a cell.
 */
export function applySeverityColor(cell: ExcelJS.Cell, severity: string) {
  const color = SEVERITY_FILL[severity.toUpperCase()];
  if (color) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${color}` },
    };
  }
}

/**
 * Apply compliance status-based background color to a cell.
 */
export function applyStatusColor(cell: ExcelJS.Cell, status: string) {
  const color = STATUS_FILL[status.toUpperCase()];
  if (color) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: `FF${color}` },
    };
  }
}

// ─── Auto-fit Columns ───────────────────────────────────────────────────────

/**
 * Auto-fit column widths based on content. Respects minimum width from column defs.
 */
export function autoFitColumns(sheet: ExcelJS.Worksheet, columns: ColumnDef[]) {
  columns.forEach((col, index) => {
    const colObj = sheet.getColumn(index + 1);
    let maxWidth = col.width ?? 18;

    colObj.eachCell({ includeEmpty: false }, (cell) => {
      const cellValue = cell.value?.toString() ?? "";
      const cellWidth = Math.min(cellValue.length + 4, 50);
      if (cellWidth > maxWidth) {
        maxWidth = cellWidth;
      }
    });

    colObj.width = maxWidth;
  });
}

// ─── Merge Header Rows ─────────────────────────────────────────────────────

/**
 * Merge cells in header rows (1-3) across all columns.
 */
export function mergeHeaderRows(sheet: ExcelJS.Worksheet, columnCount: number) {
  if (columnCount > 1) {
    sheet.mergeCells(1, 1, 1, columnCount);
    sheet.mergeCells(2, 1, 2, columnCount);
    sheet.mergeCells(3, 1, 3, columnCount);
  }
}

// ─── To Buffer ──────────────────────────────────────────────────────────────

/**
 * Convert workbook to ArrayBuffer for HTTP Response body.
 */
export async function toBuffer(
  workbook: ExcelJS.Workbook,
): Promise<ArrayBuffer> {
  const buffer = await workbook.xlsx.writeBuffer();
  // writeBuffer returns ArrayBuffer (or Buffer in Node) — ensure we have ArrayBuffer
  return buffer instanceof ArrayBuffer
    ? buffer
    : (buffer as { buffer: ArrayBuffer }).buffer;
}
