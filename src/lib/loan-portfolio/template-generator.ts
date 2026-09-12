/**
 * Excel template generator for loan portfolio imports.
 *
 * Generates a per-module styled .xlsx file with:
 * - Standard mandatory columns (Account Number, Borrower Name, etc.)
 * - Module-specific extra columns (based on MODULE_FIELD_CONFIGS)
 * - 3 example rows with realistic Indian bank data
 * - Asset class dropdown validation
 * - Styled headers and example rows
 */

import ExcelJS from "exceljs";
import { MODULE_FIELD_CONFIGS } from "./types";

// ─── Asset class values for dropdown validation ───────────────────────────────

const ASSET_CLASSES = [
  "STANDARD",
  "SMA0",
  "SMA1",
  "SMA2",
  "NPA_SUB",
  "NPA_DOUBTFUL",
  "NPA_LOSS",
];

// ─── generateLoanTemplate ─────────────────────────────────────────────────────

/**
 * Generate a styled Excel template for the given loan module.
 *
 * @param moduleCode - Module code (e.g., "HOUSING_LOANS", "CRD-HLN", "GOLD_LOANS")
 * @returns Buffer containing the .xlsx file
 */
export async function generateLoanTemplate(
  moduleCode: string,
): Promise<Buffer> {
  const moduleConfig =
    MODULE_FIELD_CONFIGS[moduleCode] ?? MODULE_FIELD_CONFIGS["DEFAULT"];

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "AEGIS Audit Platform";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Loan Portfolio");

  // ─── Column definitions ─────────────────────────────────────────────────

  const baseColumns: Partial<ExcelJS.Column>[] = [
    { header: "Account Number*", key: "accountNo", width: 22 },
    { header: "Borrower Name*", key: "borrowerName", width: 28 },
    { header: "Sanction Amount*", key: "sanctionAmount", width: 18 },
    { header: "Outstanding Amount*", key: "outstandingAmount", width: 20 },
    { header: "Loan Type*", key: "loanType", width: 20 },
    { header: "DPD", key: "dpd", width: 10 },
    { header: "Sanction Date", key: "sanctionDate", width: 16 },
    { header: "Asset Class", key: "assetClass", width: 16 },
  ];

  // Append module-specific columns
  const metaColumns: Partial<ExcelJS.Column>[] =
    moduleConfig.metadataFields.map((field) => ({
      header: field.label,
      key: field.key,
      width: 20,
    }));

  sheet.columns = [...baseColumns, ...metaColumns];

  // ─── Header row styling ──────────────────────────────────────────────────

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE5E7EB" }, // Tailwind gray-200 equivalent
  };
  headerRow.border = {
    bottom: { style: "thin", color: { argb: "FF9CA3AF" } },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };

  // ─── Data validation for Asset Class column ──────────────────────────────

  // Find Asset Class column index (1-based)
  const assetClassColIdx =
    baseColumns.findIndex((c) => c.key === "assetClass") + 1;
  const assetClassColLetter = sheet.getColumn(assetClassColIdx).letter;

  for (let rowNum = 2; rowNum <= 1001; rowNum++) {
    sheet.getCell(`${assetClassColLetter}${rowNum}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`"${ASSET_CLASSES.join(",")}"`],
      showErrorMessage: true,
      errorTitle: "Invalid Asset Class",
      error: `Please select from: ${ASSET_CLASSES.join(", ")}`,
    };
  }

  // ─── Example rows ────────────────────────────────────────────────────────

  // Build example rows based on module type
  const exampleRows = buildExampleRows(moduleCode, moduleConfig.metadataFields);

  for (const exampleRow of exampleRows) {
    sheet.addRow(exampleRow);
  }

  // Style example rows (italic + light blue fill)
  for (let r = 2; r <= 1 + exampleRows.length; r++) {
    const row = sheet.getRow(r);
    row.font = { italic: true };
    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEFF6FF" }, // Tailwind blue-50 equivalent
    };
  }

  // ─── Instructions note on A1 ─────────────────────────────────────────────

  sheet.getCell("A1").note = {
    texts: [
      {
        text: [
          `Instructions — ${moduleConfig.label} Loan Portfolio Upload:`,
          "1. Rows 2-4 are examples (styled in blue/italic)",
          "2. Delete example rows before uploading",
          "3. Fill your data starting from row 5",
          "4. Fields marked with * are mandatory",
          "5. DPD = Days Past Due (default: 0)",
          "6. Sanction Date formats: DD/MM/YYYY or YYYY-MM-DD",
          "7. Asset Class: STANDARD, SMA0, SMA1, SMA2, NPA_SUB, NPA_DOUBTFUL, NPA_LOSS",
          "8. Maximum 10,000 accounts per upload",
        ].join("\n"),
      },
    ],
    margins: {
      insetmode: "custom",
      inset: [10, 10, 10, 10],
    },
  };

  // ─── Generate and return buffer ──────────────────────────────────────────

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// ─── Example row builder ─────────────────────────────────────────────────────

function buildExampleRows(
  moduleCode: string,
  metadataFields: { key: string; label: string; type: "string" | "number" }[],
): Record<string, string | number>[] {
  // Base example data — realistic Indian bank loan accounts
  const baseRows: Record<string, string | number>[] = [
    {
      accountNo: "LA-2024-001",
      borrowerName: "Rajesh Sharma",
      sanctionAmount: 2500000,
      outstandingAmount: 2100000,
      loanType: getDefaultLoanType(moduleCode),
      dpd: 0,
      sanctionDate: "15/06/2023",
      assetClass: "STANDARD",
    },
    {
      accountNo: "LA-2024-002",
      borrowerName: "Priya Patel",
      sanctionAmount: 1800000,
      outstandingAmount: 1650000,
      loanType: getDefaultLoanType(moduleCode),
      dpd: 45,
      sanctionDate: "22/11/2022",
      assetClass: "SMA1",
    },
    {
      accountNo: "LA-2024-003",
      borrowerName: "Suresh Kumar",
      sanctionAmount: 3500000,
      outstandingAmount: 3200000,
      loanType: getDefaultLoanType(moduleCode),
      dpd: 0,
      sanctionDate: "08/03/2024",
      assetClass: "STANDARD",
    },
  ];

  // Append module-specific metadata field defaults
  const metaDefaults = getMetaDefaults(moduleCode, metadataFields);

  return baseRows.map((row) => ({ ...row, ...metaDefaults }));
}

function getDefaultLoanType(moduleCode: string): string {
  const code = moduleCode.toUpperCase();
  if (code.includes("GOLD") || code === "CRD-GLD") return "Gold Loan";
  if (code.includes("VEHICLE") || code === "CRD-VEH") return "Vehicle Loan";
  if (code.includes("PERSONAL")) return "Personal Loan";
  return "Housing Loan";
}

function getMetaDefaults(
  moduleCode: string,
  metadataFields: { key: string; label: string; type: "string" | "number" }[],
): Record<string, string | number> {
  const defaults: Record<string, string | number> = {};
  const code = moduleCode.toUpperCase();

  for (const field of metadataFields) {
    if (field.type === "number") {
      if (field.key === "propertyValue") defaults[field.key] = 3500000;
      else if (field.key === "goldWeight") defaults[field.key] = 50;
      else if (field.key === "vehicleValue") defaults[field.key] = 800000;
      else defaults[field.key] = 0;
    } else {
      if (field.key === "collateralType")
        defaults[field.key] = "Self-Occupied Property";
      else if (field.key === "goldPurity") defaults[field.key] = "22K";
      else if (field.key === "vehicleType") defaults[field.key] = "Two-Wheeler";
      else defaults[field.key] = "N/A";
    }
  }

  return defaults;
}
