import { z } from "zod";

/**
 * Schema for detecting repeat findings via pg_trgm similarity.
 * Used before an observation is submitted (DRAFT state).
 */
export const DetectRepeatSchema = z.object({
  branchId: z.string().uuid("Invalid branch ID"),
  auditAreaId: z.string().uuid("Invalid audit area ID"),
  riskCategory: z.string().optional(),
  title: z.string().min(5, "Title must be at least 5 characters"),
});

export type DetectRepeatInput = z.infer<typeof DetectRepeatSchema>;

/**
 * Schema for confirming a repeat finding suggestion.
 * Links the new observation to the old one and triggers severity escalation.
 */
export const ConfirmRepeatSchema = z.object({
  observationId: z.string().uuid("Invalid observation ID"),
  repeatOfId: z.string().uuid("Invalid repeat-of observation ID"),
  version: z.number().int().positive("Version must be a positive integer"),
});

export type ConfirmRepeatInput = z.infer<typeof ConfirmRepeatSchema>;

/**
 * Schema for dismissing a repeat finding suggestion.
 * Records the auditor's decision in the timeline without severity change.
 */
export const DismissRepeatSchema = z.object({
  observationId: z.string().uuid("Invalid observation ID"),
  repeatOfId: z.string().uuid("Invalid repeat-of observation ID"),
});

export type DismissRepeatInput = z.infer<typeof DismissRepeatSchema>;
