import type { ObservationStatus } from "@/generated/prisma/enums";

export type MakerCheckerResult =
  | { allowed: true }
  | { allowed: false; reason: string };

/** Someone who already acted on this record, named for the refusal message. */
interface PriorAct {
  /** Past-tense verb completing "You ___ this record". */
  verb: string;
  userId: string | null;
}

/**
 * Refuse an actor who already appears earlier in the record's chain.
 *
 * A null userId records a stage nobody has reached yet and imposes nothing.
 */
export function requireDistinctActor(
  actorId: string,
  priorActs: PriorAct[],
): MakerCheckerResult {
  const clash = priorActs.find((act) => act.userId === actorId);

  if (clash) {
    return {
      allowed: false,
      reason: `You ${clash.verb} this record; a different user must perform this step.`,
    };
  }

  return { allowed: true };
}

/**
 * Maker-checker for the observation lifecycle.
 *
 * The person who raised an observation may not carry it through review, issue,
 * or closure. Reviewer and issuer are both AUDIT_MANAGER by design in
 * src/lib/state-machine.ts, so they are not required to differ from one
 * another — only from the maker. RESPONSE→COMPLIANCE is a record of fact
 * rather than an approval and is left alone.
 */
export function checkObservationTransition(
  from: ObservationStatus,
  to: ObservationStatus,
  actorId: string,
  record: { createdById: string },
): MakerCheckerResult {
  const requiresChecker =
    (from === "SUBMITTED" && to === "REVIEWED") ||
    (from === "REVIEWED" && to === "ISSUED") ||
    (from === "COMPLIANCE" && to === "CLOSED");

  if (!requiresChecker) {
    return { allowed: true };
  }

  return requireDistinctActor(actorId, [
    { verb: "raised", userId: record.createdById },
  ]);
}

/**
 * Maker-checker for the report routing workflow.
 *
 * The reviewer may neither approve nor issue. The approver may issue: only CAE
 * can issue, so requiring issuer to differ from approver would leave a bank
 * with a single CAE unable to issue any report at all.
 */
export function checkReportTransition(
  from: string,
  to: string,
  actorId: string,
  record: { reportReviewedById: string | null },
): MakerCheckerResult {
  const requiresChecker =
    (from === "REVIEWED" && to === "APPROVED") ||
    (from === "APPROVED" && to === "ISSUED");

  if (!requiresChecker) {
    return { allowed: true };
  }

  return requireDistinctActor(actorId, [
    { verb: "reviewed", userId: record.reportReviewedById },
  ]);
}
