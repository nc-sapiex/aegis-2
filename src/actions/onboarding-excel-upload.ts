"use server";

/**
 * Server actions for Excel template download and upload (onboarding org structure).
 *
 * Actions:
 * - downloadOrgStructureTemplate: generates and returns template as base64
 * - uploadOrgStructureExcel: validates and parses uploaded .xlsx file
 *
 * Multi-layer validation:
 * - Layer 1: Extension check (.xlsx)
 * - Layer 2: Size check (2MB limit)
 * - Layer 3: MIME type check
 * - Layer 4: Magic bytes verification (file-type)
 * - Layer 5: Parse with ExcelJS (structure + data validation)
 */

import { generateOrgStructureTemplate } from "@/lib/excel-templates/org-structure-template";
import { parseOrgStructureExcel } from "@/lib/excel-parsers/org-structure-parser";
import type { BranchEntry, DepartmentEntry } from "@/types/onboarding";
import { logger } from "@/lib/logger";
import { getOnboardingSession } from "@/data-access/session";
import { hasPermission } from "@/lib/permissions";
import type { Role } from "@/generated/prisma/enums";

type DownloadResult =
  | {
      success: true;
      data: string; // base64
      filename: string;
    }
  | {
      success: false;
      error: string;
    };

type UploadResult =
  | {
      success: true;
      data: { branches: BranchEntry[]; departments: DepartmentEntry[] };
      warnings: string[];
    }
  | {
      success: false;
      error: string;
    };

async function requireOnboardingPermission() {
  const session = await getOnboardingSession();
  if (
    !hasPermission(
      (session.user.roles as Role[] | undefined) ?? [],
      "admin:manage_settings",
    )
  ) {
    throw new Error("Unauthorized: admin:manage_settings permission required");
  }
}

/**
 * Generate and return Excel template as base64 string.
 * Requires onboarding admin permission.
 */
export async function downloadOrgStructureTemplate(): Promise<DownloadResult> {
  try {
    await requireOnboardingPermission();
    const buffer = await generateOrgStructureTemplate();
    const base64 = buffer.toString("base64");

    return {
      success: true,
      data: base64,
      filename: "aegis-org-structure-template.xlsx",
    };
  } catch (error) {
    logger.error(
      { error, action: "download_org_structure_template" },
      "Failed to generate org structure template",
    );
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to generate template. Please try again.",
    };
  }
}

/**
 * Upload and parse org structure Excel file.
 * Multi-layer validation before parsing.
 */
export async function uploadOrgStructureExcel(
  formData: FormData,
): Promise<UploadResult> {
  try {
    await requireOnboardingPermission();
    // Extract file from FormData
    const file = formData.get("file") as File | null;

    if (!file) {
      return {
        success: false,
        error: "No file provided",
      };
    }

    // ─── Layer 1: Extension Check ──────────────────────────────────────

    if (!file.name.endsWith(".xlsx")) {
      return {
        success: false,
        error:
          "Only .xlsx files are supported. Please save your file as Excel Workbook (.xlsx).",
      };
    }

    // ─── Layer 2: Size Check (2MB limit) ───────────────────────────────

    const MAX_SIZE = 2 * 1024 * 1024; // 2MB
    if (file.size > MAX_SIZE) {
      return {
        success: false,
        error: "File too large. Maximum size is 2MB.",
      };
    }

    // ─── Layer 3: MIME Type Check ──────────────────────────────────────

    const XLSX_MIME =
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    // Some browsers don't set MIME for drag-drop, so allow empty string
    if (file.type && file.type !== XLSX_MIME) {
      return {
        success: false,
        error: `Invalid file type. Expected .xlsx file but got ${file.type}.`,
      };
    }

    // ─── Layer 4: Magic Bytes Verification ─────────────────────────────

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Dynamic import for file-type (ESM-only module)
    const { fileTypeFromBuffer } = await import("file-type");
    const detectedType = await fileTypeFromBuffer(buffer);

    if (!detectedType || detectedType.mime !== XLSX_MIME) {
      return {
        success: false,
        error:
          "File content does not match .xlsx format. The file may be corrupted or a different format renamed to .xlsx.",
      };
    }

    // ─── Layer 5: Parse Excel ──────────────────────────────────────────

    const parseResult = await parseOrgStructureExcel(buffer);

    // Return parse result directly (it already has success/error shape)
    return parseResult;
  } catch (error) {
    logger.error(
      { error, action: "upload_org_structure_excel" },
      "Failed to upload and parse org structure Excel",
    );
    return {
      success: false,
      error:
        error instanceof Error
          ? `Upload failed: ${error.message}`
          : "Failed to process file. Please try again.",
    };
  }
}
