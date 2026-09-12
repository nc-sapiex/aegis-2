/**
 * Fuzzy column header matching and mapping for loan portfolio imports.
 *
 * Detects header variations commonly found in Indian bank exports
 * (e.g., "account_no", "Account Number", "acct_no") and maps them
 * to canonical field names.
 *
 * Matching strategy:
 * 1. Exact match against known aliases (case-insensitive, trimmed)
 * 2. Fuzzy match using Levenshtein distance (≤ 2, string length ≥ 4)
 * 3. If no match: confidence = "unmatched" (column is ignored)
 */

import {
  type ColumnMapping,
  type ValidationResult,
  type ParsedLoanRow,
  type RowValidationError,
  MODULE_FIELD_CONFIGS,
  MANDATORY_FIELDS,
} from "./types";

// ─── Canonical Headers ────────────────────────────────────────────────────────

/**
 * Map of canonical field name → array of known aliases (lowercase for comparison).
 * Covers common variations found in UCB/bank-generated reports.
 */
export const CANONICAL_HEADERS: Record<string, string[]> = {
  accountNo: [
    "account_no",
    "accountno",
    "account number",
    "acct_no",
    "acct no",
    "account no",
    "loan_account_no",
    "loan account number",
    "loan_no",
    "loan no",
    "acc_no",
    "acc no",
  ],
  borrowerName: [
    "borrower_name",
    "borrowername",
    "borrower",
    "customer_name",
    "customer name",
    "name",
    "applicant_name",
    "applicant name",
    "member_name",
    "member name",
  ],
  sanctionAmount: [
    "sanction_amount",
    "sanctionamount",
    "sanction amount",
    "sanctioned_amount",
    "sanctioned amount",
    "limit",
    "sanction_limit",
    "sanctioned_limit",
    "loan_amount",
    "loan amount",
    "sanctioned limit",
  ],
  outstandingAmount: [
    "outstanding_amount",
    "outstandingamount",
    "outstanding amount",
    "outstanding",
    "balance",
    "os_amount",
    "os amount",
    "current_balance",
    "current balance",
    "principal_outstanding",
    "principal outstanding",
  ],
  loanType: [
    "loan_type",
    "loantype",
    "loan type",
    "product_type",
    "product type",
    "product",
    "producttype",
    "type",
    "scheme",
    "scheme_code",
    "scheme code",
  ],
  dpd: [
    "dpd",
    "days_past_due",
    "days past due",
    "overdue_days",
    "overdue days",
    "days_overdue",
    "days overdue",
  ],
  sanctionDate: [
    "sanction_date",
    "sanctiondate",
    "sanction date",
    "disbursement_date",
    "disbursement date",
    "disbursed_date",
    "disbursed date",
    "date_of_sanction",
    "date of sanction",
  ],
  assetClass: [
    "asset_class",
    "assetclass",
    "asset class",
    "classification",
    "asset_classification",
    "asset classification",
    "npa_class",
    "npa class",
    "category",
  ],
};

// ─── Levenshtein Distance ─────────────────────────────────────────────────────

/**
 * Compute Levenshtein edit distance between two strings.
 * Used for fuzzy header matching.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Initialize matrix
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

// ─── Build Full Alias Map ─────────────────────────────────────────────────────

/**
 * Build a complete alias-to-canonical map including module-specific metadata fields.
 * Module metadata field keys are added with their own alias patterns.
 */
function buildAliasMap(
  moduleCode: string,
): Map<string, { canonical: string; isMetadata: boolean }> {
  const map = new Map<string, { canonical: string; isMetadata: boolean }>();

  // Add base canonical headers
  for (const [canonical, aliases] of Object.entries(CANONICAL_HEADERS)) {
    for (const alias of aliases) {
      map.set(alias.toLowerCase(), { canonical, isMetadata: false });
    }
    // Also accept the canonical name itself
    map.set(canonical.toLowerCase(), { canonical, isMetadata: false });
  }

  // Add module-specific metadata fields
  const moduleConfig =
    MODULE_FIELD_CONFIGS[moduleCode] ?? MODULE_FIELD_CONFIGS["DEFAULT"];
  for (const field of moduleConfig.metadataFields) {
    const key = field.key.toLowerCase();
    const labelLower = field.label.toLowerCase();
    const snakeKey = field.key.replace(/([A-Z])/g, "_$1").toLowerCase();

    map.set(key, { canonical: field.key, isMetadata: true });
    map.set(labelLower, { canonical: field.key, isMetadata: true });
    map.set(snakeKey, { canonical: field.key, isMetadata: true });
  }

  return map;
}

// ─── detectColumnMapping ──────────────────────────────────────────────────────

/**
 * Detect column mapping for uploaded file headers.
 *
 * For each source header:
 * 1. Normalize to lowercase + trim
 * 2. Try exact match against aliases
 * 3. If no exact match, try fuzzy (Levenshtein ≤ 2, source length ≥ 4)
 * 4. Unmatched headers get confidence: "unmatched" (ignored during import)
 *
 * @param headers - Raw column headers from CSV/Excel file
 * @param moduleCode - Active module code (e.g., "HOUSING_LOANS", "CRD-HLN")
 * @returns Array of ColumnMapping objects (one per source header)
 */
export function detectColumnMapping(
  headers: string[],
  moduleCode: string,
): ColumnMapping[] {
  const aliasMap = buildAliasMap(moduleCode);

  return headers.map((header) => {
    const normalized = header.toLowerCase().trim();

    // Exact match
    const exactMatch = aliasMap.get(normalized);
    if (exactMatch) {
      return {
        sourceColumn: header,
        targetField: exactMatch.canonical,
        confidence: "exact" as const,
      };
    }

    // Fuzzy match — only for strings of length ≥ 4
    if (normalized.length >= 4) {
      let bestMatch: { canonical: string; distance: number } | null = null;

      for (const [alias, target] of Array.from(aliasMap.entries())) {
        if (alias.length < 4) continue; // Skip short aliases in fuzzy
        const distance = levenshteinDistance(normalized, alias);
        if (distance <= 2) {
          if (!bestMatch || distance < bestMatch.distance) {
            bestMatch = { canonical: target.canonical, distance };
          }
        }
      }

      if (bestMatch) {
        return {
          sourceColumn: header,
          targetField: bestMatch.canonical,
          confidence: "fuzzy" as const,
        };
      }
    }

    // No match
    return {
      sourceColumn: header,
      targetField: normalized,
      confidence: "unmatched" as const,
    };
  });
}

// ─── Date Parsing ─────────────────────────────────────────────────────────────

/**
 * Parse a date string in various formats common in Indian banking:
 * - ISO: YYYY-MM-DD
 * - DD/MM/YYYY
 * - DD-MM-YYYY
 * - DD.MM.YYYY
 *
 * Returns ISO date string (YYYY-MM-DD) or null if parsing fails.
 */
function parseDate(value: string): string | null {
  if (!value || value.trim() === "") return null;

  const trimmed = value.trim();

  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return trimmed;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const d = new Date(
      `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
    );
    if (!isNaN(d.getTime())) {
      return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  // MM/DD/YYYY (American format — less common but try as fallback)
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    const [, month, day, year] = mdyMatch;
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    // Only try this if month > 12 (then it must be DD/MM) — handled above
    // Here we treat it as DD/MM if month > 12, else ambiguous — skip
    if (monthNum <= 12 && dayNum <= 31) {
      const d = new Date(
        `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`,
      );
      if (!isNaN(d.getTime())) {
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
      }
    }
  }

  return null;
}

// ─── validateAndTransformRows ─────────────────────────────────────────────────

/**
 * Apply column mapping to raw rows, validate mandatory fields, parse types,
 * apply defaults, and collect errors/warnings.
 *
 * @param rawRows - Raw rows from CSV/Excel parser (string values)
 * @param mapping - Column mapping from detectColumnMapping
 * @param moduleCode - Active module code for metadata field extraction
 * @returns ValidationResult with valid rows, rejected rows, and warnings
 */
export function validateAndTransformRows(
  rawRows: Record<string, string>[],
  mapping: ColumnMapping[],
  moduleCode: string,
): ValidationResult {
  const moduleConfig =
    MODULE_FIELD_CONFIGS[moduleCode] ?? MODULE_FIELD_CONFIGS["DEFAULT"];
  const metadataFieldKeys = new Set(
    moduleConfig.metadataFields.map((f) => f.key),
  );

  const validRows: ParsedLoanRow[] = [];
  const rejectedRows: { rowNumber: number; errors: RowValidationError[] }[] =
    [];
  const warnings: { rowNumber: number; message: string }[] = [];

  rawRows.forEach((rawRow, index) => {
    const rowNumber = index + 2; // 1-based, +1 for header row
    const errors: RowValidationError[] = [];
    const rowWarnings: string[] = [];

    // Apply column mapping: build canonical field map
    const canonical: Record<string, string> = {};
    const metadataRaw: Record<string, string> = {};

    for (const col of mapping) {
      if (col.confidence === "unmatched") continue;
      const rawValue = rawRow[col.sourceColumn] ?? "";
      if (metadataFieldKeys.has(col.targetField)) {
        metadataRaw[col.targetField] = rawValue;
      } else {
        canonical[col.targetField] = rawValue;
      }
    }

    // ── Mandatory field validation ──────────────────────────────────────────

    // accountNo
    const accountNoRaw = (canonical["accountNo"] ?? "").trim();
    if (!accountNoRaw) {
      errors.push({
        rowNumber,
        field: "accountNo",
        message: "Account number is required",
      });
    }

    // borrowerName
    const borrowerNameRaw = (canonical["borrowerName"] ?? "").trim();
    if (!borrowerNameRaw) {
      errors.push({
        rowNumber,
        field: "borrowerName",
        message: "Borrower name is required",
      });
    }

    // sanctionAmount
    const sanctionAmountRaw = (canonical["sanctionAmount"] ?? "").trim();
    let sanctionAmount = 0;
    if (!sanctionAmountRaw) {
      errors.push({
        rowNumber,
        field: "sanctionAmount",
        message: "Sanction amount is required",
      });
    } else {
      // Remove commas (Indian number format: 25,00,000)
      const cleaned = sanctionAmountRaw.replace(/,/g, "");
      sanctionAmount = parseFloat(cleaned);
      if (isNaN(sanctionAmount) || sanctionAmount < 0) {
        errors.push({
          rowNumber,
          field: "sanctionAmount",
          message: `Invalid sanction amount: "${sanctionAmountRaw}" — must be a positive number`,
        });
      }
    }

    // outstandingAmount
    const outstandingAmountRaw = (canonical["outstandingAmount"] ?? "").trim();
    let outstandingAmount = 0;
    if (!outstandingAmountRaw) {
      errors.push({
        rowNumber,
        field: "outstandingAmount",
        message: "Outstanding amount is required",
      });
    } else {
      const cleaned = outstandingAmountRaw.replace(/,/g, "");
      outstandingAmount = parseFloat(cleaned);
      if (isNaN(outstandingAmount) || outstandingAmount < 0) {
        errors.push({
          rowNumber,
          field: "outstandingAmount",
          message: `Invalid outstanding amount: "${outstandingAmountRaw}" — must be a non-negative number`,
        });
      }
    }

    // loanType
    const loanTypeRaw = (canonical["loanType"] ?? "").trim();
    if (!loanTypeRaw) {
      errors.push({
        rowNumber,
        field: "loanType",
        message: "Loan type is required",
      });
    }

    // ── Optional field parsing with defaults ───────────────────────────────

    // dpd — default 0
    const dpdRaw = (canonical["dpd"] ?? "").trim();
    let dpd = 0;
    if (dpdRaw) {
      const parsed = parseInt(dpdRaw, 10);
      if (isNaN(parsed) || parsed < 0) {
        rowWarnings.push(`DPD "${dpdRaw}" is invalid — defaulted to 0`);
      } else {
        dpd = parsed;
      }
    }

    // assetClass — default "STANDARD"
    const assetClassRaw = (canonical["assetClass"] ?? "").trim();
    let assetClass = "STANDARD";
    if (assetClassRaw) {
      const valid = [
        "STANDARD",
        "SMA0",
        "SMA1",
        "SMA2",
        "NPA_SUB",
        "NPA_DOUBTFUL",
        "NPA_LOSS",
      ];
      // Normalize common variations
      const normalized = assetClassRaw
        .toUpperCase()
        .replace(/[^A-Z0-9_]/g, "_");
      if (valid.includes(normalized)) {
        assetClass = normalized;
      } else if (valid.includes(assetClassRaw.toUpperCase())) {
        assetClass = assetClassRaw.toUpperCase();
      } else {
        rowWarnings.push(
          `Asset class "${assetClassRaw}" is not recognized — defaulted to "STANDARD"`,
        );
      }
    }

    // sanctionDate — parse if provided, null if not
    const sanctionDateRaw = (canonical["sanctionDate"] ?? "").trim();
    let sanctionDate: string | null = null;
    if (sanctionDateRaw) {
      sanctionDate = parseDate(sanctionDateRaw);
      if (!sanctionDate) {
        rowWarnings.push(
          `Sanction date "${sanctionDateRaw}" could not be parsed — will be set to import date`,
        );
      }
    }

    // ── Metadata fields ────────────────────────────────────────────────────

    const metadata: Record<string, unknown> = {};
    for (const field of moduleConfig.metadataFields) {
      const rawValue = (metadataRaw[field.key] ?? "").trim();
      if (rawValue) {
        if (field.type === "number") {
          const cleaned = rawValue.replace(/,/g, "");
          const num = parseFloat(cleaned);
          if (!isNaN(num)) {
            metadata[field.key] = num;
          } else {
            rowWarnings.push(
              `${field.label} "${rawValue}" is not a valid number — skipped`,
            );
          }
        } else {
          metadata[field.key] = rawValue;
        }
      }
    }

    // ── Collect result ────────────────────────────────────────────────────

    if (errors.length > 0) {
      rejectedRows.push({ rowNumber, errors });
    } else {
      validRows.push({
        accountNo: accountNoRaw,
        borrowerName: borrowerNameRaw,
        sanctionAmount,
        outstandingAmount,
        loanType: loanTypeRaw,
        dpd,
        sanctionDate,
        assetClass,
        metadata,
      });
    }

    for (const msg of rowWarnings) {
      warnings.push({ rowNumber, message: msg });
    }
  });

  return { validRows, rejectedRows, warnings };
}
