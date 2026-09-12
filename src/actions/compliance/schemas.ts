import { z } from "zod";

export const CreateComplianceItemsSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
});

export type CreateComplianceItemsInput = z.infer<
  typeof CreateComplianceItemsSchema
>;

export const SubmitBranchResponseSchema = z.object({
  complianceItemId: z.string().uuid("Invalid compliance item ID"),
  responseText: z.string().min(10, "Response must be at least 10 characters"),
  evidenceS3Keys: z.array(z.string()).optional(),
});

export type SubmitBranchResponseInput = z.infer<
  typeof SubmitBranchResponseSchema
>;

export const ZacReviewSchema = z.object({
  complianceItemId: z.string().uuid("Invalid compliance item ID"),
  decision: z.enum(["APPROVED", "REJECTED", "REQUEST_INFO"], {
    message: "Invalid decision",
  }),
  comments: z.string().min(5, "Comments must be at least 5 characters"),
});

export type ZacReviewInput = z.infer<typeof ZacReviewSchema>;

// ─── ACE Processing ───────────────────────────────────────────
export const ReviewAceItemSchema = z.object({
  complianceItemId: z.string().uuid(),
  decision: z.enum(["FORWARD_TO_ACB", "MONITOR", "CLOSE"]),
  comments: z.string().min(1, "Comments are required").max(2000),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, "Format: YYYY-Q1..Q4"),
});

export const ProcessAceQuarterlySchema = z.object({
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, "Format: YYYY-Q1..Q4"),
});

export type ReviewAceItemInput = z.infer<typeof ReviewAceItemSchema>;
export type ProcessAceQuarterlyInput = z.infer<
  typeof ProcessAceQuarterlySchema
>;

// ─── ACB Reporting ────────────────────────────────────────────
export const GenerateAcbReportSchema = z.object({
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/, "Format: YYYY-Q1..Q4"),
  title: z.string().min(1).max(200),
  executiveCommentary: z.string().max(5000).optional(),
});

export type GenerateAcbReportInput = z.infer<typeof GenerateAcbReportSchema>;
