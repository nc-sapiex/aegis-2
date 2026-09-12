import { z } from "zod";

/**
 * Zod schemas for examination question management server action inputs.
 *
 * QMGT-02: HIA can add new questions with all QMGT-04 fields.
 * QMGT-03: Questions can be deactivated without deleting historical responses.
 */

export const AddQuestionSchema = z.object({
  moduleCode: z
    .string()
    .min(1, "Module code is required")
    .max(20, "Module code must be 20 characters or fewer"),
  text: z
    .string()
    .min(10, "Question text must be at least 10 characters")
    .max(1000, "Question text must be 1000 characters or fewer"),
  rbiReference: z
    .string()
    .max(500, "RBI reference must be 500 characters or fewer")
    .optional()
    .nullable(),
  bestPracticeTip: z
    .string()
    .max(1000, "Best practice tip must be 1000 characters or fewer")
    .optional()
    .nullable(),
  category: z
    .string()
    .max(100, "Category must be 100 characters or fewer")
    .optional()
    .nullable(),
  weight: z
    .number()
    .min(0.1, "Weight must be at least 0.1")
    .max(10, "Weight must be at most 10")
    .default(1.0),
  isCritical: z.boolean().default(false),
});

export const UpdateQuestionSchema = z.object({
  questionId: z.string().uuid("Invalid question ID"),
  text: z
    .string()
    .min(10, "Question text must be at least 10 characters")
    .max(1000, "Question text must be 1000 characters or fewer")
    .optional(),
  rbiReference: z
    .string()
    .max(500, "RBI reference must be 500 characters or fewer")
    .optional()
    .nullable(),
  bestPracticeTip: z
    .string()
    .max(1000, "Best practice tip must be 1000 characters or fewer")
    .optional()
    .nullable(),
  category: z
    .string()
    .max(100, "Category must be 100 characters or fewer")
    .optional()
    .nullable(),
  weight: z
    .number()
    .min(0.1, "Weight must be at least 0.1")
    .max(10, "Weight must be at most 10")
    .optional(),
  isCritical: z.boolean().optional(),
});

export const DeactivateQuestionSchema = z.object({
  questionId: z.string().uuid("Invalid question ID"),
});

export type AddQuestionInput = z.infer<typeof AddQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof UpdateQuestionSchema>;
export type DeactivateQuestionInput = z.infer<typeof DeactivateQuestionSchema>;

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
