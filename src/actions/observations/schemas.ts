import { z } from "zod";

/**
 * Zod validation schemas for observation server actions.
 *
 * CreateObservationSchema: 5C format (OBS-01) — condition, criteria, cause, effect, recommendation
 * TransitionObservationSchema: Generic state transition with optimistic locking (OBS-02, OBS-03)
 * ResolveFieldworkSchema: Mark observation resolved during fieldwork (OBS-07)
 */

// ─── CreateObservationSchema (OBS-01: 5C format) ────────────────────────────

export const CreateObservationSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  condition: z.string().min(10, "Condition must be at least 10 characters"),
  criteria: z.string().min(10, "Criteria must be at least 10 characters"),
  cause: z.string().min(10, "Cause must be at least 10 characters"),
  effect: z.string().min(10, "Effect must be at least 10 characters"),
  recommendation: z
    .string()
    .min(10, "Recommendation must be at least 10 characters"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  branchId: z.string().uuid().optional(),
  auditAreaId: z.string().uuid().optional(),
  assignedToId: z.string().uuid().optional(),
  riskCategory: z.string().optional(),
  dueDate: z.string().datetime().optional(),
});

export type CreateObservationInput = z.infer<typeof CreateObservationSchema>;

// ─── TransitionObservationSchema (OBS-02, OBS-03) ───────────────────────────

export const TransitionObservationSchema = z.object({
  observationId: z.string().uuid(),
  targetStatus: z.enum([
    "SUBMITTED",
    "REVIEWED",
    "DRAFT",
    "ISSUED",
    "RESPONSE",
    "COMPLIANCE",
    "CLOSED",
  ]),
  comment: z.string().min(1, "Comment required for state transitions"),
  version: z.number().int().positive(),
  // Optional fields for RESPONSE state
  auditeeResponse: z.string().optional(),
  actionPlan: z.string().optional(),
});

export type TransitionObservationInput = z.infer<
  typeof TransitionObservationSchema
>;

// ─── ResolveFieldworkSchema (OBS-07) ────────────────────────────────────────

export const ResolveFieldworkSchema = z.object({
  observationId: z.string().uuid(),
  resolutionReason: z
    .string()
    .min(10, "Resolution reason must be at least 10 characters"),
  version: z.number().int().positive(),
});

export type ResolveFieldworkInput = z.infer<typeof ResolveFieldworkSchema>;
