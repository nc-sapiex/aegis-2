export const ACCOUNT_EXAM_NOT_APPLICABLE_PREFIX = "__NOT_APPLICABLE__::";

export type AccountExamUiStatus = "COMPLIANT" | "VIOLATION" | "NOT_APPLICABLE";

export function encodeAccountExamNote(
  status: AccountExamUiStatus,
  note: string | null | undefined,
): { status: "COMPLIANT" | "VIOLATION"; note: string | null } {
  const cleanedNote = note?.trim() ?? "";

  if (status === "NOT_APPLICABLE") {
    return {
      status: "COMPLIANT",
      note: `${ACCOUNT_EXAM_NOT_APPLICABLE_PREFIX}${cleanedNote}`,
    };
  }

  return {
    status,
    note: cleanedNote.length > 0 ? cleanedNote : null,
  };
}

export function decodeAccountExamResponse(
  status: "COMPLIANT" | "VIOLATION",
  note: string | null,
): { status: AccountExamUiStatus; note: string | null } {
  if (!note?.startsWith(ACCOUNT_EXAM_NOT_APPLICABLE_PREFIX)) {
    return { status, note };
  }

  const decoded = note.slice(ACCOUNT_EXAM_NOT_APPLICABLE_PREFIX.length).trim();
  return {
    status: "NOT_APPLICABLE",
    note: decoded.length > 0 ? decoded : null,
  };
}
