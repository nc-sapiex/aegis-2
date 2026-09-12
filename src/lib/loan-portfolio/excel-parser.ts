/**
 * Excel (.xlsx) buffer parser for loan portfolio imports.
 *
 * Parses Excel workbooks using ExcelJS and returns the same uniform shape
 * as the CSV parser: { headers: string[]; rows: Record<string, string>[] }
 *
 * Features:
 * - Uses first worksheet (banks typically export single-sheet files)
 * - Row 1 is the header row
 * - Remaining rows are data rows
 * - Skips completely empty rows
 * - Cell values are normalized to strings via getCellValue helper
 * - Handles formula cells (uses result value)
 */

import ExcelJS from "exceljs";

// ─── getCellValue ─────────────────────────────────────────────────────────────

/**
 * Extract and normalize a cell value to string.
 * Handles null, undefined, numbers, booleans, dates, and formula results.
 */
function getCellValue(cell: ExcelJS.Cell): string {
  const value = cell.value;

  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number") {
    return value.toString().trim();
  }

  if (typeof value === "boolean") {
    return value.toString();
  }

  // Handle Date objects (ExcelJS returns Date for date-formatted cells)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    // Format as DD/MM/YYYY (Indian standard)
    const day = value.getDate().toString().padStart(2, "0");
    const month = (value.getMonth() + 1).toString().padStart(2, "0");
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Handle formula results (Rich text, shared strings)
  if (typeof value === "object") {
    // Shared formula result
    if ("result" in value) {
      const result = (value as { result: unknown }).result;
      if (typeof result === "string") return result.trim();
      if (typeof result === "number") return result.toString().trim();
      if (result instanceof Date) {
        if (isNaN(result.getTime())) return "";
        const day = result.getDate().toString().padStart(2, "0");
        const month = (result.getMonth() + 1).toString().padStart(2, "0");
        const year = result.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return "";
    }

    // Rich text (formatted cells with runs)
    if ("richText" in value) {
      const richText = (value as { richText: Array<{ text: string }> })
        .richText;
      return richText
        .map((r) => r.text)
        .join("")
        .trim();
    }

    // Hyperlink cell
    if ("text" in value) {
      const text = (value as { text: unknown }).text;
      if (typeof text === "string") return text.trim();
    }
  }

  // Fallback: stringify and trim
  return String(value).trim();
}

// ─── parseExcelBuffer ─────────────────────────────────────────────────────────

/**
 * Parse an Excel (.xlsx) buffer into headers and rows.
 *
 * - Loads the workbook from the buffer
 * - Uses the first worksheet
 * - Row 1 is the header row
 * - Returns raw string values (no type coercion — done by column-mapper.ts)
 *
 * @param buffer - Raw .xlsx file buffer
 * @returns Object with headers array and rows as Record<string, string>[]
 */
export async function parseExcelBuffer(buffer: Buffer): Promise<{
  headers: string[];
  rows: Record<string, string>[];
}> {
  const workbook = new ExcelJS.Workbook();

  // Load workbook from buffer
  await workbook.xlsx.load(buffer as any);

  // Get the first worksheet
  const worksheet = workbook.worksheets[0];

  if (!worksheet) {
    return { headers: [], rows: [] };
  }

  const allRows: ExcelJS.Row[] = [];
  worksheet.eachRow((row) => {
    allRows.push(row);
  });

  if (allRows.length === 0) {
    return { headers: [], rows: [] };
  }

  // Row 1 is headers
  const headerRow = allRows[0];
  const headers: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell) => {
    const val = getCellValue(cell);
    if (val) headers.push(val);
  });

  if (headers.length === 0) {
    return { headers: [], rows: [] };
  }

  // Determine the column count from headers
  const colCount = headers.length;

  // Parse data rows (rows 2+)
  const rows: Record<string, string>[] = [];

  for (let r = 1; r < allRows.length; r++) {
    const row = allRows[r];

    // Check if row is completely empty
    let hasData = false;
    for (let c = 1; c <= colCount; c++) {
      const val = getCellValue(row.getCell(c));
      if (val) {
        hasData = true;
        break;
      }
    }

    if (!hasData) continue;

    // Build row object
    const rowObj: Record<string, string> = {};
    for (let c = 0; c < colCount; c++) {
      rowObj[headers[c]] = getCellValue(row.getCell(c + 1));
    }

    rows.push(rowObj);
  }

  return { headers, rows };
}
