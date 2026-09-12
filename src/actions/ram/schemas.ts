import { z } from "zod";

export const CreateRamAssessmentSchema = z.object({
  branchId: z.string().uuid("Invalid branch ID"),
  assessmentYear: z
    .string()
    .regex(
      /^\d{4}-\d{2}$/,
      "Assessment year must be in format YYYY-YY (e.g., 2025-26)",
    ),
});

export type CreateRamAssessmentInput = z.infer<
  typeof CreateRamAssessmentSchema
>;

export const SaveRamScoresSchema = z.object({
  assessmentId: z.string().uuid("Invalid assessment ID"),
  scores: z
    .array(
      z.object({
        paramConfigId: z.string().uuid("Invalid parameter config ID"),
        score: z
          .number()
          .min(1, "Score must be 1-5")
          .max(5, "Score must be 1-5"),
        remarks: z.string().max(500).optional(),
      }),
    )
    .min(1, "At least one score is required"),
});

export type SaveRamScoresInput = z.infer<typeof SaveRamScoresSchema>;

export const AssessmentIdSchema = z.object({
  assessmentId: z.string().uuid("Invalid assessment ID"),
});
