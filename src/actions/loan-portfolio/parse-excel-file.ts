"use server";

/**
 * Server action: parseExcelFile
 *
 * Accepts a FormData with a `file` field (.xlsx), parses it using ExcelJS
 * (server-side only), and returns { headers, rows } for client-side column
 * mapping.
 *
 * Security: requires authenticated session (any logged-in user).
 * File size limit: 10MB.
 */

import { getRequiredSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { parseExcelBuffer } from "@/lib/loan-portfolio/excel-parser";

// 10MB file size limit
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ─── parseExcelFile ───────────────────────────────────────────────────────────

/**
 * Parse an uploaded Excel (.xlsx) file server-side.
 *
 * @param formData - FormData containing a `file` field (File/Blob)
 * @returns { success: true, data: { headers, rows } } or { success: false, error }
 */
export async function parseExcelFile(formData: FormData): Promise<
  | {
      success: true;
      data: {
        headers: string[];
        rows: Record<string, string>[];
      };
    }
  | { success: false; error: string }
> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await getRequiredSession();
  const userRoles = session.user.roles;

  if (!hasPermission(userRoles, "rbia:examine")) {
    return {
      success: false,
      error: "You do not have permission to upload loan portfolio files.",
    };
  }

  // ── Extract file ──────────────────────────────────────────────────────────
  const file = formData.get("file");

  if (!file || !(file instanceof Blob)) {
    return { success: false, error: "No file provided in the request." };
  }

  // ── Size check ────────────────────────────────────────────────────────────
  if (file.size > MAX_FILE_SIZE) {
    return {
      success: false,
      error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 10MB.`,
    };
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { headers, rows } = await parseExcelBuffer(buffer);

    logger.info(
      {
        action: "parse_excel_file",
        tenantId: session.user.tenantId,
        rowCount: rows.length,
        headerCount: headers.length,
      },
      "Excel file parsed successfully",
    );

    return { success: true, data: { headers, rows } };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to parse Excel file. Please check the file format.";

    logger.error(
      { error, action: "parse_excel_file", tenantId: session.user.tenantId },
      message,
    );

    return { success: false, error: message };
  }
}
