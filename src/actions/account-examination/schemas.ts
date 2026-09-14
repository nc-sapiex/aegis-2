import { z } from "zod";

/**
 * Zod schemas for account examination server action inputs.
 *
 * AEXM-03: Records COMPLIANT/VIOLATION per account-question pair.
 * AEXM-04: Captures optional auditor notes with each response.
 */

export const SaveAccountExamResponseSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  recordId: z.string().uuid("Invalid record ID"),
  questionId: z.string().uuid("Invalid question ID"),
  status: z.enum(["COMPLIANT", "VIOLATION", "NOT_APPLICABLE"], {
    error: "Status must be COMPLIANT, VIOLATION, or NOT_APPLICABLE",
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
  { success: true; data: T } | { success: false; error: string };
