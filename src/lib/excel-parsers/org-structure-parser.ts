/**
 * Excel parser for Organization Structure (Step 4 onboarding).
 *
 * Parses .xlsx files and extracts branches and departments.
 * Multi-layer validation:
 * - Checks for required worksheets (Branches, Departments)
 * - Validates required fields (name, code, city, state, type for branches; name, code for departments)
 * - Normalizes type values (HO, Branch, Extension Counter)
 * - Skips completely empty rows
 * - Collects warnings for rows with missing fields but doesn't reject entire file
 *
 * Returns ParseResult with success/error shape.
 */

import ExcelJS from "exceljs";
import type { BranchEntry, DepartmentEntry } from "@/types/onboarding";

type ParseResult =
  | {
      success: true;
      data: { branches: BranchEntry[]; departments: DepartmentEntry[] };
      warnings: string[];
    }
  | {
      success: false;
      error: string;
    };

// Valid branch types (normalized)
const VALID_BRANCH_TYPES = ["HO", "Branch", "Extension Counter"] as const;

// Type normalization mapping
const TYPE_ALIASES: Record<string, string> = {
  "Head Office": "HO",
  HO: "HO",
  Branch: "Branch",
  "Extension Counter": "Extension Counter",
  EC: "Extension Counter",
};

/**
 * Parse an Excel workbook buffer and extract branches and departments.
 */
export async function parseOrgStructureExcel(
  buffer: Buffer,
): Promise<ParseResult> {
  const warnings: string[] = [];

  try {
    // Load workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    // Check for required worksheets
    const branchesSheet = workbook.getWorksheet("Branches");
    if (!branchesSheet) {
      return {
        success: false,
        error:
          "Missing 'Branches' worksheet. Please use the provided template.",
      };
    }

    const departmentsSheet = workbook.getWorksheet("Departments");
    if (!departmentsSheet) {
      return {
        success: false,
        error:
          "Missing 'Departments' worksheet. Please use the provided template.",
      };
    }

    // ─── Parse Branches ────────────────────────────────────────────────

    const branches: BranchEntry[] = [];
    let branchRowIndex = 0;

    branchesSheet.eachRow((row, rowNumber) => {
      branchRowIndex = rowNumber;

      // Skip header row
      if (rowNumber === 1) return;

      // Extract cell values
      const name = getCellValue(row.getCell(1));
      const code = getCellValue(row.getCell(2));
      const city = getCellValue(row.getCell(3));
      const state = getCellValue(row.getCell(4));
      const type = getCellValue(row.getCell(5));
      const managerName = getCellValue(row.getCell(6));
      const managerEmail = getCellValue(row.getCell(7));

      // Skip completely empty rows
      if (
        !name &&
        !code &&
        !city &&
        !state &&
        !type &&
        !managerName &&
        !managerEmail
      ) {
        return;
      }

      // Validate required fields
      const missingFields: string[] = [];
      if (!name) missingFields.push("Branch Name");
      if (!code) missingFields.push("Branch Code");
      if (!city) missingFields.push("City");
      if (!state) missingFields.push("State");
      if (!type) missingFields.push("Type");

      if (missingFields.length > 0) {
        warnings.push(
          `Row ${rowNumber} in Branches: missing ${missingFields.join(", ")} — row skipped`,
        );
        return;
      }

      // Normalize type
      let normalizedType = TYPE_ALIASES[type];
      if (!normalizedType) {
        warnings.push(
          `Row ${rowNumber} in Branches: unknown type '${type}' — defaulting to 'Branch'`,
        );
        normalizedType = "Branch";
      }

      // Validate normalized type
      if (!VALID_BRANCH_TYPES.includes(normalizedType as any)) {
        warnings.push(
          `Row ${rowNumber} in Branches: invalid type '${normalizedType}' — defaulting to 'Branch'`,
        );
        normalizedType = "Branch";
      }

      branches.push({
        name,
        code,
        city,
        state,
        type: normalizedType,
        managerName,
        managerEmail,
      });
    });

    // ─── Parse Departments ─────────────────────────────────────────────

    const departments: DepartmentEntry[] = [];
    let deptRowIndex = 0;

    departmentsSheet.eachRow((row, rowNumber) => {
      deptRowIndex = rowNumber;

      // Skip header row
      if (rowNumber === 1) return;

      // Extract cell values
      const name = getCellValue(row.getCell(1));
      const code = getCellValue(row.getCell(2));
      const headName = getCellValue(row.getCell(3));
      const headEmail = getCellValue(row.getCell(4));

      // Skip completely empty rows
      if (!name && !code && !headName && !headEmail) {
        return;
      }

      // Validate required fields
      const missingFields: string[] = [];
      if (!name) missingFields.push("Department Name");
      if (!code) missingFields.push("Department Code");

      if (missingFields.length > 0) {
        warnings.push(
          `Row ${rowNumber} in Departments: missing ${missingFields.join(", ")} — row skipped`,
        );
        return;
      }

      departments.push({
        name,
        code: code.toUpperCase(), // Uppercase the code
        headName,
        headEmail,
      });
    });

    // ─── Validation ────────────────────────────────────────────────────

    if (branches.length === 0 && departments.length === 0) {
      return {
        success: false,
        error:
          "No data found in the uploaded file. Please check that you filled in the template.",
      };
    }

    return {
      success: true,
      data: { branches, departments },
      warnings,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse Excel file: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Extract and normalize cell value to string.
 * Handles null, undefined, numbers, and strings.
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

  // Handle formula results
  if (typeof value === "object" && "result" in value) {
    const result = (value as any).result;
    if (typeof result === "string") {
      return result.trim();
    }
    if (typeof result === "number") {
      return result.toString().trim();
    }
  }

  // Fallback: stringify and trim
  return String(value).trim();
}
