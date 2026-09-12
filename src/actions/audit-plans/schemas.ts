import { z } from "zod";

/**
 * Schema for annual audit plan generation.
 *
 * Input:
 * - fiscalYear: FY label in format "YYYY-YY" (e.g., "2025-26")
 * - autoCreateEngagements: false = preview mode, true = commit to database
 */
export const GenerateAnnualPlanSchema = z.object({
  fiscalYear: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Invalid fiscal year format (e.g., 2025-26)"),
  autoCreateEngagements: z.boolean().default(false), // Preview mode by default
});

export type GenerateAnnualPlanInput = z.infer<typeof GenerateAnnualPlanSchema>;
