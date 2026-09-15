"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { ScaleTick } from "./scale-tick";
import { StateWord } from "./state-word";
import { RemarksBand } from "./remarks-band";
import { deriveStatementState } from "@/lib/statement-state";
import { scoreStatement } from "@/actions/rbia/score-statement";
import { saveAccountExamResponse } from "@/actions/account-examination/save-response";
import type { ScoreLabel, ContentOrigin } from "@/generated/prisma/enums";

export type BinaryStatus = "COMPLIANT" | "VIOLATION" | "NOT_APPLICABLE";

export type RegisterStatement = {
  id: string;
  code: string;
  text: string;
  isCritical?: boolean;
  origin?: ContentOrigin;
};

export type RegisterResponse = {
  value: ScoreLabel | BinaryStatus | null;
  remarks: string | null;
  isNotApplicable?: boolean;
  notApplicableReason?: string | null;
  version?: number;
  respondedByName?: string | null;
};

const SCALE_KEYS: Record<string, ScoreLabel> = {
  "1": "FULLY_COMPLIANT",
  "2": "LARGELY_COMPLIANT",
  "3": "PARTIALLY_COMPLIANT",
  "4": "MARGINALLY_COMPLIANT",
  "5": "NON_COMPLIANT",
};

const BINARY_LABEL: Record<BinaryStatus, string> = {
  COMPLIANT: "Compliant",
  VIOLATION: "Violation",
  NOT_APPLICABLE: "Not applicable",
};

function BinaryTick({
  value,
  disabled,
  onSet,
}: {
  value: BinaryStatus | null;
  disabled: boolean;
  onSet: (status: BinaryStatus) => void;
}) {
  return (
    <div role="radiogroup" className="flex items-center gap-2">
      {(["COMPLIANT", "VIOLATION", "NOT_APPLICABLE"] as const).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          aria-label={BINARY_LABEL[option]}
          disabled={disabled}
          onClick={() => onSet(option)}
          className={cn(
            "h-[22px] min-h-11 w-[22px] min-w-11 rounded-full border border-[color:var(--border-strong)]",
            value === option &&
              option === "VIOLATION" &&
              "bg-[color:var(--destructive)]",
            value === option &&
              option !== "VIOLATION" &&
              "bg-[color:var(--primary)]",
          )}
        />
      ))}
    </div>
  );
}

function BinaryStateWord({
  value,
  saveFailed,
}: {
  value: BinaryStatus | null;
  saveFailed: boolean;
}) {
  if (saveFailed) {
    return (
      <span className="text-[11px] tracking-wide text-[color:var(--destructive)] uppercase">
        Not saved · Retry
      </span>
    );
  }
  if (!value) {
    return (
      <span className="text-[11px] tracking-wide text-[color:var(--muted-foreground)] uppercase">
        Untouched
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-[11px] tracking-wide uppercase",
        value === "VIOLATION"
          ? "text-[color:var(--destructive)]"
          : "text-[color:var(--muted-foreground)]",
      )}
    >
      {BINARY_LABEL[value]}
    </span>
  );
}

export function ExaminationRegister({
  engagementId,
  statements,
  initialResponses,
  mode = "scale",
  disabled = false,
  binaryContext,
}: {
  engagementId: string;
  statements: RegisterStatement[];
  initialResponses: Record<string, RegisterResponse>;
  mode?: "scale" | "binary";
  disabled?: boolean;
  binaryContext?: { recordId: string; canRespond: boolean };
}) {
  const [responses, setResponses] = React.useState(initialResponses);
  const [saveFailed, setSaveFailed] = React.useState<Record<string, boolean>>(
    {},
  );
  const [drafts, setDrafts] = React.useState<
    Record<string, { remarks: string; naReason: string }>
  >({});

  React.useEffect(() => {
    setResponses(initialResponses);
  }, [initialResponses]);

  const rowDisabled =
    disabled || (mode === "binary" && !binaryContext?.canRespond);

  async function handleScoreScale(nodeId: string, label: ScoreLabel) {
    const current = responses[nodeId] ?? { value: null, remarks: null };
    const draft = drafts[nodeId]?.remarks ?? current.remarks ?? "";
    setResponses((r) => ({
      ...r,
      [nodeId]: { ...current, value: label, isNotApplicable: false },
    }));
    const result = await scoreStatement({
      engagementId,
      nodeId,
      scoreLabel: label,
      remarks: draft || null,
      expectedVersion: current.version ?? 1,
    });
    if (!result.success) {
      setSaveFailed((f) => ({ ...f, [nodeId]: true }));
      setResponses((r) => ({ ...r, [nodeId]: current }));
      return;
    }
    setSaveFailed((f) => ({ ...f, [nodeId]: false }));
    setResponses((r) => ({
      ...r,
      [nodeId]: { ...r[nodeId], version: result.data.version },
    }));
  }

  function handleScoreBinary(questionId: string, status: BinaryStatus) {
    if (!binaryContext?.canRespond || disabled) return;
    const current = responses[questionId] ?? { value: null, remarks: null };
    const draft = drafts[questionId]?.remarks ?? current.remarks ?? null;
    const attempted: RegisterResponse = { value: status, remarks: draft };
    setResponses((r) => ({ ...r, [questionId]: attempted }));
    void saveAccountExamResponse({
      engagementId,
      recordId: binaryContext.recordId,
      questionId,
      status,
      note: draft,
    }).then((result) => {
      if (!result.success) {
        setSaveFailed((f) => ({ ...f, [questionId]: true }));
        setResponses((r) => {
          const live = r[questionId];
          if (
            live?.value === attempted.value &&
            live.remarks === attempted.remarks
          ) {
            return { ...r, [questionId]: current };
          }
          return r;
        });
      } else {
        setSaveFailed((f) => ({ ...f, [questionId]: false }));
      }
    });
  }

  function handleToggleNa(nodeId: string, na: boolean) {
    // ponytail: local only, no persistence yet — Task 17 wires N/A saving.
    setResponses((r) => ({
      ...r,
      [nodeId]: {
        ...(r[nodeId] ?? { value: null, remarks: null }),
        isNotApplicable: na,
        value: na ? null : (r[nodeId]?.value ?? null),
      },
    }));
  }

  function handleKeyDown(
    e: React.KeyboardEvent<HTMLDivElement>,
    statement: RegisterStatement,
    response: RegisterResponse,
  ) {
    if (mode !== "scale" || rowDisabled) return;
    if (e.key === "0") {
      handleToggleNa(statement.id, !response.isNotApplicable);
      return;
    }
    if (response.isNotApplicable) return;
    const label = SCALE_KEYS[e.key];
    if (label) void handleScoreScale(statement.id, label);
  }

  return (
    <div className="examination-register">
      {statements.map((statement) => {
        const response = responses[statement.id] ?? {
          value: null,
          remarks: null,
        };
        const failed = Boolean(saveFailed[statement.id]);
        const draftRemarks =
          drafts[statement.id]?.remarks ?? response.remarks ?? "";
        const draftNaReason =
          drafts[statement.id]?.naReason ?? response.notApplicableReason ?? "";

        const scaleState =
          mode === "scale"
            ? deriveStatementState({
                scoreLabel: (response.value as ScoreLabel | null) ?? null,
                remarks: draftRemarks,
                isNotApplicable: Boolean(response.isNotApplicable),
                saveFailed: failed,
              })
            : null;

        return (
          <div
            key={statement.id}
            id={statement.code}
            data-section
            className="border-b border-[color:var(--border)] py-2"
            onKeyDown={(e) => handleKeyDown(e, statement, response)}
          >
            <div className="grid grid-cols-[auto_1fr_auto] gap-4">
              <div>
                <div className="text-[13px] font-medium tabular-nums">
                  {statement.code}
                </div>
                {statement.isCritical && (
                  <span className="text-[11px] tracking-wide text-[color:var(--destructive)] uppercase">
                    Critical
                  </span>
                )}
                {statement.origin === "BANK" && (
                  <span className="text-[11px] tracking-wide text-[color:var(--primary)] uppercase">
                    Bank
                  </span>
                )}
                {mode === "scale" && scaleState ? (
                  <StateWord
                    state={scaleState}
                    scoredBy={response.respondedByName ?? undefined}
                  />
                ) : (
                  <BinaryStateWord
                    value={response.value as BinaryStatus | null}
                    saveFailed={failed}
                  />
                )}
                {mode === "scale" &&
                  statement.isCritical &&
                  scaleState === "non_compliant" && (
                    <div className="text-[12.5px] text-[color:var(--destructive)]">
                      Below Partly caps the module at 0.50
                    </div>
                  )}
              </div>
              <div className="text-[16px]">{statement.text}</div>
              {mode === "scale" ? (
                <ScaleTick
                  statementCode={statement.code}
                  statementText={statement.text}
                  value={response.value as ScoreLabel | null}
                  isNotApplicable={Boolean(response.isNotApplicable)}
                  disabled={rowDisabled}
                  onScore={(label) =>
                    void handleScoreScale(statement.id, label)
                  }
                  onToggleNa={(na) => handleToggleNa(statement.id, na)}
                />
              ) : (
                <BinaryTick
                  value={response.value as BinaryStatus | null}
                  disabled={rowDisabled}
                  onSet={(status) => handleScoreBinary(statement.id, status)}
                />
              )}
            </div>
            {mode === "scale" && scaleState && (
              <RemarksBand
                state={scaleState}
                isNotApplicable={Boolean(response.isNotApplicable)}
                remarks={draftRemarks}
                naReason={draftNaReason}
                scoreEffect={null}
                onChangeRemarks={(v) =>
                  setDrafts((d) => ({
                    ...d,
                    [statement.id]: {
                      remarks: v,
                      naReason: d[statement.id]?.naReason ?? "",
                    },
                  }))
                }
                onChangeNaReason={(v) =>
                  setDrafts((d) => ({
                    ...d,
                    [statement.id]: {
                      remarks: d[statement.id]?.remarks ?? "",
                      naReason: v,
                    },
                  }))
                }
              />
            )}
            {mode === "binary" && (
              <div
                data-remarks-band
                className="border-t border-[color:var(--border)] py-2"
              >
                <textarea
                  value={draftRemarks}
                  disabled={rowDisabled}
                  onChange={(e) =>
                    setDrafts((d) => ({
                      ...d,
                      [statement.id]: {
                        remarks: e.target.value,
                        naReason: d[statement.id]?.naReason ?? "",
                      },
                    }))
                  }
                  onBlur={() => {
                    if (!response.value) return;
                    if (draftRemarks === (response.remarks ?? "")) return;
                    handleScoreBinary(
                      statement.id,
                      response.value as BinaryStatus,
                    );
                  }}
                  placeholder="Add remarks"
                  aria-label="Remarks"
                  className="min-h-16 w-full rounded border border-[color:var(--border)] p-2 text-sm"
                />
              </div>
            )}
          </div>
        );
      })}
      <div data-register-controls className="py-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="text-[12.5px] text-[color:var(--primary)] underline"
        >
          Print section
        </button>
      </div>
    </div>
  );
}
