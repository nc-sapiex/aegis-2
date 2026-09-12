import { z } from "zod";

/**
 * Zod schemas for account examination server action inputs.
 *
 * AEXM-03: Records COMPLIANT/VIOLATION per account-question pair.
 * AEXM-04: Captures optional auditor notes with each response.
 */

export const SaveAccountExamResponseSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  loanAccountId: z.string().uuid("Invalid loan account ID"),
  questionId: z.string().uuid("Invalid question ID"),
  status: z.enum(["COMPLIANT", "VIOLATION"], {
    error: "Status must be COMPLIANT or VIOLATION",
  }),
  note: z
    .string()
    .max(2000, "Note must be 2000 characters or fewer")
    .optional()
    .nullable(),
});

export type SaveAccountExamResponseInput = z.infer<
  typeof SaveAccountExamResponseSchema
>;

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
