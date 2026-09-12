import { z } from "zod";

export const AssignTeamMemberSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  userId: z.string().uuid("Invalid user ID"),
  roleInEngagement: z.enum(["LEAD_AUDITOR", "FIELD_AUDITOR"], {
    message: "Role must be LEAD_AUDITOR or FIELD_AUDITOR",
  }),
  assignedSections: z.array(z.string()).default([]),
});

export type AssignTeamMemberInput = z.infer<typeof AssignTeamMemberSchema>;

export const RemoveTeamMemberSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  userId: z.string().uuid("Invalid user ID"),
});

export type RemoveTeamMemberInput = z.infer<typeof RemoveTeamMemberSchema>;

export const InitializeSectionsSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
});

export type InitializeSectionsInput = z.infer<typeof InitializeSectionsSchema>;

export const SubmitExaminationResponseSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  itemId: z.string().uuid("Invalid item ID"),
  status: z.enum(["COMPLIANT", "NON_COMPLIANT", "PARTIAL", "NOT_APPLICABLE"], {
    message:
      "Status must be COMPLIANT, NON_COMPLIANT, PARTIAL, or NOT_APPLICABLE",
  }),
  observation: z.string().max(2000).optional(),
  riskRating: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export type SubmitExaminationResponseInput = z.infer<
  typeof SubmitExaminationResponseSchema
>;

export const UpdateSectionStatusSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  sectionCode: z.string().min(1, "Section code is required"),
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "REVIEWED"], {
    message: "Invalid section status",
  }),
});

export type UpdateSectionStatusInput = z.infer<
  typeof UpdateSectionStatusSchema
>;

// ─── Cash Verification (Denomination + ATM) ───────────────────
const DenominationDataSchema = z
  .object({
    "2000": z.number().int().min(0).default(0),
    "500": z.number().int().min(0).default(0),
    "200": z.number().int().min(0).default(0),
    "100": z.number().int().min(0).default(0),
    "50": z.number().int().min(0).default(0),
    "20": z.number().int().min(0).default(0),
    "10": z.number().int().min(0).default(0),
    "5": z.number().int().min(0).default(0),
    "2": z.number().int().min(0).default(0),
    "1": z.number().int().min(0).default(0),
  })
  .partial();

const AtmBalancesSchema = z.record(z.string(), z.number().min(0));

export const SaveCashVerificationSchema = z.object({
  engagementId: z.string().uuid(),
  cashInHand: z.number().min(0, "Cash in hand must be non-negative"),
  bookBalance: z.number().min(0, "Book balance must be non-negative"),
  retentionLimit: z.number().min(0).optional(),
  denominationData: DenominationDataSchema.optional(),
  atmBalances: AtmBalancesSchema.optional(),
  remarks: z.string().max(2000).optional(),
});

export type SaveCashVerificationInput = z.infer<
  typeof SaveCashVerificationSchema
>;

// ─── BH Certificate ───────────────────────────────────────────
export const SignBhCertificateSchema = z.object({
  engagementId: z.string().uuid(),
  comments: z.string().min(1, "Please add acknowledgment comments").max(2000),
  declarationAccepted: z.literal(true).refine((val) => val === true, {
    message: "You must accept the declaration to sign",
  }),
});

export const CountersignBhCertificateSchema = z.object({
  engagementId: z.string().uuid(),
  comments: z.string().max(2000).optional(),
});

export type SignBhCertificateInput = z.infer<typeof SignBhCertificateSchema>;
export type CountersignBhCertificateInput = z.infer<
  typeof CountersignBhCertificateSchema
>;

// ─── Create Engagement (A2) ──────────────────────────────────
export const CreateEngagementSchema = z.object({
  auditPlanId: z.string().uuid("Invalid audit plan ID"),
  branchId: z.string().uuid("Invalid branch ID"),
  auditAreaId: z.string().uuid("Invalid audit area ID").optional(),
  auditType: z.string().min(1, "Audit type is required"),
  auditNumber: z.string().optional(),
  scheduledStartDate: z.string().min(1, "Start date is required"),
  completionDate: z.string().min(1, "Completion date is required"),
  periodFrom: z.string().min(1, "Period from is required"),
  periodTo: z.string().min(1, "Period to is required"),
  visitNumber: z.number().int().min(1).default(1),
  // R11 optional fields
  plannedOpeningMeetingDate: z.string().optional(),
  plannedExitMeetingDate: z.string().optional(),
  ramAssessmentId: z.string().uuid("Invalid RAM assessment ID").optional(),
  scopeNotes: z
    .string()
    .max(4000, "Scope notes must be 4000 characters or less")
    .optional(),
});

export type CreateEngagementInput = z.infer<typeof CreateEngagementSchema>;

// ─── Evidence Upload (A4) ────────────────────────────────────
export const RequestExamEvidenceUploadSchema = z.object({
  engagementId: z.string().uuid(),
  responseId: z.string().uuid(),
  fileName: z.string().min(1, "File name is required"),
  fileSize: z.number().int().positive("File size must be positive"),
  contentType: z.string().min(1, "Content type is required"),
  fileHeader: z.string().optional(),
});

export type RequestExamEvidenceUploadInput = z.infer<
  typeof RequestExamEvidenceUploadSchema
>;

export const ConfirmExamEvidenceUploadSchema = z.object({
  engagementId: z.string().uuid(),
  responseId: z.string().uuid(),
  s3Key: z.string().min(1, "S3 key is required"),
  filename: z.string().min(1, "Filename is required"),
  fileSize: z.number().int().positive(),
  contentType: z.string().min(1, "Content type is required"),
  description: z.string().optional(),
});

export type ConfirmExamEvidenceUploadInput = z.infer<
  typeof ConfirmExamEvidenceUploadSchema
>;

// ─── Loan Review (A6) ────────────────────────────────────────
export const CreateLoanReviewSchema = z.object({
  engagementId: z.string().uuid(),
  accountNo: z.string().min(1, "Account number is required"),
  borrowerName: z.string().min(1, "Borrower name is required"),
  productType: z.string().min(1, "Product type is required"),
  sanctionAmount: z.number().min(0, "Sanction amount must be non-negative"),
  outstandingAmount: z.number().min(0, "Outstanding must be non-negative"),
  assetClass: z.enum([
    "STANDARD",
    "SMA0",
    "SMA1",
    "SMA2",
    "NPA_DOUBTFUL",
    "NPA_LOSS",
    "NPA_SUB",
  ]),
  dpd: z.number().int().min(0).default(0),
  auditObservation: z.string().max(2000).optional(),
});

export type CreateLoanReviewInput = z.infer<typeof CreateLoanReviewSchema>;

export const UpdateLoanReviewSchema = CreateLoanReviewSchema.extend({
  id: z.string().uuid(),
});

export type UpdateLoanReviewInput = z.infer<typeof UpdateLoanReviewSchema>;

export const ImportLoanCsvSchema = z.object({
  engagementId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        accountNo: z.string(),
        borrowerName: z.string(),
        productType: z.string(),
        sanctionAmount: z.number(),
        outstandingAmount: z.number(),
        assetClass: z.string(),
        dpd: z.number().default(0),
        auditObservation: z.string().optional(),
      }),
    )
    .min(1, "At least one row required")
    .max(5000, "Maximum 5000 rows"),
});

export type ImportLoanCsvInput = z.infer<typeof ImportLoanCsvSchema>;

// ─── SMA/NPA (A6) ───────────────────────────────────────────
export const SaveSmaNpaEntriesSchema = z.object({
  engagementId: z.string().uuid(),
  entries: z
    .array(
      z.object({
        category: z.string().min(1),
        count: z.number().int().min(0),
        amount: z.number().min(0),
        accountCount: z.number().int().min(0).optional(),
        totalAmount: z.number().min(0).optional(),
        remarks: z.string().optional(),
      }),
    )
    .min(1),
});

export type SaveSmaNpaEntriesInput = z.infer<typeof SaveSmaNpaEntriesSchema>;

// ─── Engagement Status Transition (ISS-005) ─────────────────

/**
 * @deprecated Use TransitionEngagementStatusSchema and transitionEngagementStatus instead.
 * This schema only covers 3 of the 8 engagement states. Kept for backward compatibility.
 */
export const UpdateEngagementStatusSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  targetStatus: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"], {
    message: "Target status must be IN_PROGRESS, COMPLETED, or CANCELLED",
  }),
});

export type UpdateEngagementStatusInput = z.infer<
  typeof UpdateEngagementStatusSchema
>;

/**
 * Schema for the new state-machine-backed engagement status transition action.
 * Covers all 7 non-PLANNED target statuses in the 8-state RBIA engagement lifecycle.
 */
export const TransitionEngagementStatusSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  targetStatus: z.enum(
    [
      "TEAM_ASSIGNED",
      "OPENING_MEETING",
      "IN_PROGRESS",
      "EXIT_MEETING",
      "REPORT_DRAFT",
      "COMPLETED",
      "CANCELLED",
    ],
    {
      message: "Invalid target status",
    },
  ),
});

export type TransitionEngagementStatusInput = z.infer<
  typeof TransitionEngagementStatusSchema
>;
