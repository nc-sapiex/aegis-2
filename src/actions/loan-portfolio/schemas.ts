/**
 * Zod schemas for loan portfolio server actions.
 */

import { z } from "zod";

// ─── ImportLoanPortfolioSchema ────────────────────────────────────────────────

/**
 * Schema for the importLoanPortfolio server action.
 * Validates the engagement, module code, and all row data before persistence.
 */
export const ImportLoanPortfolioSchema = z.object({
  /** UUID of the AuditEngagement to import accounts into */
  engagementId: z.string().uuid("Invalid engagement ID"),
  /** Module code identifying which loan type is being imported */
  moduleCode: z.string().min(1, "Module code is required"),
  /** Array of validated loan account rows (already parsed by column-mapper.ts) */
  rows: z
    .array(
      z.object({
        accountNo: z.string().min(1, "Account number is required"),
        borrowerName: z.string().min(1, "Borrower name is required"),
        sanctionAmount: z.number().positive("Sanction amount must be positive"),
        outstandingAmount: z
          .number()
          .nonnegative("Outstanding amount must be non-negative"),
        loanType: z.string().min(1, "Loan type is required"),
        dpd: z.number().int().nonnegative().default(0),
        /** ISO date string or null — if null, import timestamp is used */
        sanctionDate: z.string().nullable().default(null),
        assetClass: z.string().default("STANDARD"),
        metadata: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .min(1, "At least one valid row is required")
    .max(10000, "Maximum 10,000 accounts per upload"),
});

export type ImportLoanPortfolioInput = z.infer<
  typeof ImportLoanPortfolioSchema
>;

// ─── GetPortfolioSummarySchema ────────────────────────────────────────────────

/**
 * Schema for the getPortfolioSummary server action.
 */
export const GetPortfolioSummarySchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  moduleCode: z.string().min(1, "Module code is required"),
});

export type GetPortfolioSummaryInput = z.infer<
  typeof GetPortfolioSummarySchema
>;
