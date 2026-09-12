import { z } from "zod";

/**
 * Zod validation schemas for report generation server actions.
 */

// ─── ComputeRiskRatingSchema ────────────────────────────────────────

export const ComputeRiskRatingSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
});

export type ComputeRiskRatingInput = z.infer<typeof ComputeRiskRatingSchema>;

// ─── GenerateReportSchema (for XLSX and PDF generation) ────────────

export const GenerateReportSchema = z.object({
  engagementId: z.string().uuid("Invalid engagement ID"),
  templateId: z.string().uuid("Invalid template ID").optional(),
});

export type GenerateReportInput = z.infer<typeof GenerateReportSchema>;

// ─── Report Routing Workflow (R33) ─────────────────────────────────

export const REPORT_STATUSES = [
  "DRAFT",
  "REVIEWED",
  "APPROVED",
  "ISSUED",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

// Valid transitions: DRAFT→REVIEWED, REVIEWED→APPROVED, APPROVED→ISSUED
export const REPORT_TRANSITIONS: Record<string, ReportStatus[]> = {
  DRAFT: ["REVIEWED"],
  REVIEWED: ["APPROVED", "DRAFT"], // Can send back to DRAFT for rework
  APPROVED: ["ISSUED", "REVIEWED"], // Can send back for re-review
  ISSUED: [], // Terminal state
};

// Role requirements per transition
export const TRANSITION_ROLES: Record<string, string[]> = {
  "DRAFT→REVIEWED": ["LEAD_AUDITOR", "AUDIT_MANAGER", "CAE"],
  "REVIEWED→APPROVED": ["AUDIT_MANAGER", "CAE"],
  "REVIEWED→DRAFT": ["LEAD_AUDITOR", "AUDIT_MANAGER", "CAE"], // Rework
  "APPROVED→ISSUED": ["CAE"],
  "APPROVED→REVIEWED": ["CAE"], // Re-review
};

export const TransitionReportSchema = z.object({
  engagementId: z.string().uuid(),
  targetStatus: z.enum(REPORT_STATUSES),
  comments: z.string().max(2000).optional(),
});

export type TransitionReportInput = z.infer<typeof TransitionReportSchema>;
