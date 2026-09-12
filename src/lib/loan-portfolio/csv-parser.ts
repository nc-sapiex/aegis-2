/**
 * CSV text parser for loan portfolio imports.
 *
 * Parses raw CSV text into a uniform shape:
 * { headers: string[]; rows: Record<string, string>[] }
 *
 * Features:
 * - Handles both \n and \r\n line endings
 * - Handles quoted values (fields with commas inside double quotes)
 * - Skips completely empty rows
 * - Returns raw strings (no type conversion — done by column-mapper.ts)
 */

// ─── parseQuotedCsv ───────────────────────────────────────────────────────────

/**
 * Parse a single CSV line respecting quoted fields.
 * Quoted fields may contain commas and escaped double-quotes ("")
 * Returns array of raw string values (trimmed of outer whitespace).
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++; // Skip next quote
        } else {
          inQuotes = false; // End of quoted field
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true; // Start of quoted field
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }

  // Add last field
  fields.push(current.trim());

  return fields;
}

// ─── parseCsvText ─────────────────────────────────────────────────────────────

/**
 * Parse CSV text into headers and rows.
 *
 * - First non-empty line is the header row
 * - Remaining non-empty lines are data rows
 * - Handles both LF and CRLF line endings
 * - Returns raw string values (no type coercion)
 *
 * @param text - Raw CSV text content
 * @returns Object with headers array and rows as Record<string, string>[]
 */
export function parseCsvText(text: string): {
  headers: string[];
  rows: Record<string, string>[];
} {
  // Normalize line endings
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Split into lines and filter empty lines
  const lines = normalized.split("\n");

  // Find the first non-empty line as header
  const nonEmptyLines = lines.filter((line) => line.trim() !== "");

  if (nonEmptyLines.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headerLine, ...dataLines] = nonEmptyLines;

  // Parse headers
  const headers = parseCsvLine(headerLine).filter((h) => h !== "");

  if (headers.length === 0) {
    return { headers: [], rows: [] };
  }

  // Parse data rows
  const rows: Record<string, string>[] = [];

  for (const line of dataLines) {
    // Skip completely empty lines
    if (line.trim() === "") continue;

    const values = parseCsvLine(line);

    // Skip if all values are empty (phantom row)
    if (values.every((v) => v === "")) continue;

    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = values[i] ?? "";
    }

    rows.push(row);
  }

  return { headers, rows };
}
