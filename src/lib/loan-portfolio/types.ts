/**
 * Shared types for loan portfolio parsing, validation, and import.
 *
 * Used by:
 * - column-mapper.ts (validation and transformation)
 * - csv-parser.ts (raw row shape)
 * - excel-parser.ts (raw row shape)
 * - import-loan-portfolio.ts (server action input/output)
 * - template-generator.ts (module-specific columns)
 */

// ─── Parsed Row (canonical shape after parsing + validation) ────────────────

/**
 * Canonical shape of a loan account row after parsing and column mapping.
 * This is the output of validateAndTransformRows and the input to the import action.
 */
export interface ParsedLoanRow {
  /** Loan account number — must be unique within engagement */
  accountNo: string;
  /** Full name of the borrower */
  borrowerName: string;
  /** Sanction/limit amount in INR */
  sanctionAmount: number;
  /** Current outstanding balance in INR */
  outstandingAmount: number;
  /** Loan product type (maps to productType in DB) */
  loanType: string;
  /** Days Past Due — defaults to 0 */
  dpd: number;
  /**
   * Sanction date as ISO string (YYYY-MM-DD) or null if not provided.
   * Note: DB schema requires a DateTime, so null here will be defaulted
   * to the import timestamp in the server action.
   */
  sanctionDate: string | null;
  /** Asset classification — defaults to "STANDARD" */
  assetClass: string;
  /** Module-specific extra fields stored as JSONB */
  metadata: Record<string, unknown>;
}

// ─── Validation Errors ───────────────────────────────────────────────────────

/**
 * A single validation error for a specific row and field.
 */
export interface RowValidationError {
  /** 1-based row number in the uploaded file */
  rowNumber: number;
  /** Field name that failed validation */
  field: string;
  /** Human-readable error message */
  message: string;
}

// ─── Validation Result ───────────────────────────────────────────────────────

/**
 * Result of running validateAndTransformRows.
 * Contains valid rows ready for import, rejected rows with errors, and warnings.
 */
export interface ValidationResult {
  /** Rows that passed all validation and are ready to import */
  validRows: ParsedLoanRow[];
  /** Rows that failed mandatory field validation, with per-field errors */
  rejectedRows: { rowNumber: number; errors: RowValidationError[] }[];
  /** Warnings for rows with non-fatal issues (e.g., invalid optional fields defaulted) */
  warnings: { rowNumber: number; message: string }[];
}

// ─── Column Mapping ──────────────────────────────────────────────────────────

/**
 * Represents the mapping of a source column header to a canonical field name.
 * Used to preview the detected mapping before committing to import.
 */
export interface ColumnMapping {
  /** Original header text from the uploaded file */
  sourceColumn: string;
  /** Canonical field name (e.g., "accountNo", "borrowerName") or metadata key */
  targetField: string;
  /** Confidence level of the match */
  confidence: "exact" | "fuzzy" | "unmatched";
}

// ─── Import Summary ──────────────────────────────────────────────────────────

/**
 * Summary returned by the import server action.
 */
export interface ImportSummary {
  /** Total rows in the uploaded file (excluding header) */
  totalRows: number;
  /** Number of rows successfully imported */
  accepted: number;
  /** Number of rows rejected due to validation errors */
  rejected: number;
  /** Number of warnings (non-fatal issues) */
  warnings: number;
}

// ─── Module Field Configs ────────────────────────────────────────────────────

/**
 * Per-module configuration defining module-specific metadata columns.
 * These columns are captured in the `metadata` JSONB field.
 */
export const MODULE_FIELD_CONFIGS: Record<
  string,
  {
    label: string;
    metadataFields: {
      key: string;
      label: string;
      type: "string" | "number";
    }[];
  }
> = {
  // Housing Loans (CRD-HLN or HOUSING_LOANS)
  HOUSING_LOANS: {
    label: "Housing Loans",
    metadataFields: [
      { key: "collateralType", label: "Collateral Type", type: "string" },
      { key: "propertyValue", label: "Property Value", type: "number" },
    ],
  },
  // Also map under the RBIA module code
  "CRD-HLN": {
    label: "Housing Loans",
    metadataFields: [
      { key: "collateralType", label: "Collateral Type", type: "string" },
      { key: "propertyValue", label: "Property Value", type: "number" },
    ],
  },
  // Gold Loans
  GOLD_LOANS: {
    label: "Gold Loans",
    metadataFields: [
      { key: "goldPurity", label: "Gold Purity", type: "string" },
      { key: "goldWeight", label: "Gold Weight (grams)", type: "number" },
    ],
  },
  "CRD-GLD": {
    label: "Gold Loans",
    metadataFields: [
      { key: "goldPurity", label: "Gold Purity", type: "string" },
      { key: "goldWeight", label: "Gold Weight (grams)", type: "number" },
    ],
  },
  // Vehicle Loans
  VEHICLE_LOANS: {
    label: "Vehicle Loans",
    metadataFields: [
      { key: "vehicleType", label: "Vehicle Type", type: "string" },
      { key: "vehicleValue", label: "Vehicle Value", type: "number" },
    ],
  },
  "CRD-VEH": {
    label: "Vehicle Loans",
    metadataFields: [
      { key: "vehicleType", label: "Vehicle Type", type: "string" },
      { key: "vehicleValue", label: "Vehicle Value", type: "number" },
    ],
  },
  // Fallback for unknown modules
  DEFAULT: {
    label: "Loan Portfolio",
    metadataFields: [],
  },
};

/**
 * The mandatory fields that must be present and non-empty for a row to be valid.
 */
export const MANDATORY_FIELDS: (keyof ParsedLoanRow)[] = [
  "accountNo",
  "borrowerName",
  "sanctionAmount",
  "outstandingAmount",
  "loanType",
];
