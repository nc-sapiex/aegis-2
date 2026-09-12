import { z } from "zod";

/**
 * Shared Zod validation schemas and return types for RBIA v6.0 server actions.
 *
 * This file does NOT have "use server" — it's a shared module imported by
 * both server actions and client forms.
 *
 * Schemas:
 *   SaveExaminationResponseSchema — EXAM-03, EXAM-04, EXAM-09
 *   AddModuleSelectionSchema / RemoveModuleSelectionSchema / AutoSelectModulesSchema
 *   RecordMeetingSchema / SignOffMeetingSchema — ENGG-03, ENGG-04
 *   CreateActionPointSchema / UpdateActionPointSchema / DeleteActionPointSchema — FIND-01, FIND-06
 *   PromoteToObservationSchema — FIND-03
 *   SubmitBmResponseSchema — BMRP-01
 *   FreezeRbiaScoreSchema — EXAM-10
 */

// ─── ActionResult Shared Type ─────────────────────────────────────────────────

export type ActionErrorCode =
  | "PERMISSION_DENIED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "TRANSITION_BLOCKED"
  | "SCORE_FROZEN"
  | "INCOMPLETE_EXAMINATION"
  | "INTERNAL_ERROR";

export type ActionSuccess<T> = { success: true; data: T };
export type ActionError = {
  success: false;
  error: string;
  code: ActionErrorCode;
};
export type ActionResult<T> = ActionSuccess<T> | ActionError;

// ─── SaveExaminationResponseSchema (EXAM-03, EXAM-04, EXAM-09) ───────────────

/**
 * A response is either scored or explicitly not applicable — never both, never
 * neither.
 *
 * `ScoreLabel` has no N/A member on purpose: "does not apply to this branch" is
 * not a compliance grade, and `computeNodeScore` would fold it into the
 * denominator if it were. It is carried as a separate flag, and the freeze
 * completeness gate (`findUnscoredLeaves`) accepts a leaf that has either.
 *
 * The reason is mandatory because the freeze is irreversible: an N/A with no
 * stated basis is indistinguishable from a leaf someone skipped.
 */
export const NOT_APPLICABLE_REASON_MIN = 20;

export const SaveExaminationResponseSchema = z
  .object({
    engagementId: z.string().uuid(),
    nodeId: z.string().uuid(),
    scoreLabel: z
      .enum([
        "FULLY_COMPLIANT",
        "LARGELY_COMPLIANT",
        "PARTIALLY_COMPLIANT",
        "NON_COMPLIANT",
      ])
      .optional(),
    isNotApplicable: z.boolean().default(false),
    notApplicableReason: z.string().max(2000).optional(),
    workingNotes: z.string().max(2000).optional(),
    flagForObservation: z.boolean().default(false),
    flagForActionPoint: z.boolean().default(false),
  })
  .superRefine((data, ctx) => {
    if (data.isNotApplicable) {
      if (data.scoreLabel) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["scoreLabel"],
          message: "A not-applicable item cannot also carry a score.",
        });
      }
      if (
        !data.notApplicableReason ||
        data.notApplicableReason.trim().length < NOT_APPLICABLE_REASON_MIN
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["notApplicableReason"],
          message: `A reason of at least ${NOT_APPLICABLE_REASON_MIN} characters is required to mark an item not applicable.`,
        });
      }
      // Observations and action points are findings against an item that was
      // examined. Neither is meaningful for one that does not apply.
      if (data.flagForObservation || data.flagForActionPoint) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["isNotApplicable"],
          message:
            "A not-applicable item cannot be flagged for an observation or action point.",
        });
      }
      return;
    }

    if (!data.scoreLabel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scoreLabel"],
        message:
          "A score is required unless the item is marked not applicable.",
      });
      return;
    }

    const requiresNotes = ["PARTIALLY_COMPLIANT", "NON_COMPLIANT"].includes(
      data.scoreLabel,
    );
    if (
      requiresNotes &&
      (!data.workingNotes || data.workingNotes.length < 500)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["workingNotes"],
        message:
          "Working notes (min 500 characters) required for Partially or Non-Compliant scores",
      });
    }
  });

export type SaveExaminationResponseInput = z.infer<
  typeof SaveExaminationResponseSchema
>;

// ─── Module Selection Schemas ─────────────────────────────────────────────────

export const AddModuleSelectionSchema = z.object({
  engagementId: z.string().uuid(),
  moduleNodeId: z.string().uuid(),
  reason: z.string().min(1, "Selection reason is required").max(500),
});

export type AddModuleSelectionInput = z.infer<typeof AddModuleSelectionSchema>;

export const RemoveModuleSelectionSchema = z.object({
  engagementId: z.string().uuid(),
  moduleNodeId: z.string().uuid(),
  reason: z.string().min(1, "Removal reason is required").max(500),
});

export type RemoveModuleSelectionInput = z.infer<
  typeof RemoveModuleSelectionSchema
>;

export const AutoSelectModulesSchema = z.object({
  engagementId: z.string().uuid(),
  branchCategory: z.string().nullable(),
});

export type AutoSelectModulesInput = z.infer<typeof AutoSelectModulesSchema>;

// ─── RecordMeetingSchema (ENGG-03, ENGG-04) ──────────────────────────────────

const MeetingAttendeeSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  designation: z.string().min(1),
});

export const RecordMeetingSchema = z.object({
  engagementId: z.string().uuid(),
  meetingType: z.enum(["OPENING", "EXIT"]),
  meetingDate: z.string().datetime(),
  attendees: z
    .array(MeetingAttendeeSchema)
    .min(1, "At least one attendee required"),
  minutesText: z.string().max(5000).optional(),
  keyDiscussionPoints: z.string().max(5000).optional(),
});

export type RecordMeetingInput = z.infer<typeof RecordMeetingSchema>;

export const SignOffMeetingSchema = z.object({
  engagementId: z.string().uuid(),
  meetingType: z.enum(["OPENING", "EXIT"]),
});

export type SignOffMeetingInput = z.infer<typeof SignOffMeetingSchema>;

// ─── CreateActionPointSchema (FIND-01, FIND-06) ──────────────────────────────

export const CreateActionPointSchema = z.object({
  engagementId: z.string().uuid(),
  branchId: z.string().uuid(),
  title: z.string().min(5, "Title must be at least 5 characters").max(200),
  description: z.string().min(10, "Description must be at least 10 characters"),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  moduleCode: z.string().min(1),
  sourceResponseId: z.string().uuid().optional(),
});

export type CreateActionPointInput = z.infer<typeof CreateActionPointSchema>;

export const UpdateActionPointSchema = z.object({
  actionPointId: z.string().uuid(),
  title: z.string().min(5).max(200).optional(),
  description: z.string().min(10).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
});

export type UpdateActionPointInput = z.infer<typeof UpdateActionPointSchema>;

export const DeleteActionPointSchema = z.object({
  actionPointId: z.string().uuid(),
});

export type DeleteActionPointInput = z.infer<typeof DeleteActionPointSchema>;

// ─── PromoteToObservationSchema (FIND-03) ─────────────────────────────────────

export const PromoteToObservationSchema = z.object({
  actionPointId: z.string().uuid(),
  engagementId: z.string().uuid(),
  title: z.string().min(5).max(200),
  condition: z.string().min(10),
  criteria: z.string().min(10),
  cause: z.string().min(10),
  effect: z.string().min(10),
  recommendation: z.string().min(10),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
});

export type PromoteToObservationInput = z.infer<
  typeof PromoteToObservationSchema
>;

// ─── SubmitBmResponseSchema (BMRP-01) ─────────────────────────────────────────

export const SubmitBmResponseSchema = z.object({
  actionPointId: z.string().uuid(),
  responseText: z.string().min(10, "Response must be at least 10 characters"),
});

export type SubmitBmResponseInput = z.infer<typeof SubmitBmResponseSchema>;

// ─── FreezeRbiaScoreSchema (EXAM-10) ──────────────────────────────────────────

export const FreezeRbiaScoreSchema = z.object({
  engagementId: z.string().uuid(),
});

export type FreezeRbiaScoreInput = z.infer<typeof FreezeRbiaScoreSchema>;

// ─── BM Evidence Upload Schemas (BMRP-02) ──────────────────────────────────

export const RequestBmEvidenceUploadSchema = z.object({
  actionPointId: z.string().uuid(),
  engagementId: z.string().uuid(),
  fileName: z.string().min(1),
  fileSize: z.number().int().positive(),
  contentType: z.string().min(1),
  fileHeader: z.string().optional(),
});

export type RequestBmEvidenceUploadInput = z.infer<
  typeof RequestBmEvidenceUploadSchema
>;

export const ConfirmBmEvidenceUploadSchema = z.object({
  actionPointId: z.string().uuid(),
  engagementId: z.string().uuid(),
  s3Key: z.string().min(1),
  filename: z.string().min(1),
  fileSize: z.number().positive(),
  contentType: z.string().min(1),
  description: z.string().optional(),
});

export type ConfirmBmEvidenceUploadInput = z.infer<
  typeof ConfirmBmEvidenceUploadSchema
>;
