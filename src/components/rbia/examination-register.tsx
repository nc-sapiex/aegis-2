"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { saveAccountExamResponse } from "@/actions/account-examination/save-response";

type ScaleStatus =
  | "FULLY_COMPLIANT"
  | "LARGELY_COMPLIANT"
  | "PARTIALLY_COMPLIANT"
  | "NON_COMPLIANT"
  | "NOT_APPLICABLE";

type BinaryStatus = "COMPLIANT" | "VIOLATION" | "NOT_APPLICABLE";

type RegisterStatus = ScaleStatus | BinaryStatus | null;

export type RegisterStatement = {
  id: string;
  code: string;
  text: string;
};

export type RegisterResponse = {
  status: RegisterStatus;
  remarks: string | null;
};

function StateWord({ status }: { status: RegisterStatus }) {
  if (!status) {
    return (
      <span className="text-[color:var(--muted-foreground)]">Untouched</span>
    );
  }

  const labels: Record<Exclude<RegisterStatus, null>, string> = {
    FULLY_COMPLIANT: "Fully compliant",
    LARGELY_COMPLIANT: "Largely compliant",
    PARTIALLY_COMPLIANT: "Partially compliant",
    NON_COMPLIANT: "Non-compliant",
    COMPLIANT: "Compliant",
    VIOLATION: "Violation",
    NOT_APPLICABLE: "N/A",
  };

  return <span>{labels[status]}</span>;
}

function BinaryTick({
  status,
  disabled,
  onSet,
}: {
  status: BinaryStatus | null;
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
          aria-checked={status === option}
          disabled={disabled}
          onClick={() => onSet(option)}
          className="h-[22px] min-h-11 w-[22px] min-w-11 rounded-full border border-[color:var(--border-strong)] data-[selected=true]:bg-[color:var(--primary)]"
          data-selected={status === option}
          aria-label={option.replaceAll("_", " ").toLowerCase()}
        >
          {status === option ? "✓" : ""}
        </button>
      ))}
    </div>
  );
}

function ScaleTick({
  status,
  disabled,
  onSet,
}: {
  status: ScaleStatus | null;
  disabled: boolean;
  onSet: (status: ScaleStatus) => void;
}) {
  const options: ScaleStatus[] = [
    "FULLY_COMPLIANT",
    "LARGELY_COMPLIANT",
    "PARTIALLY_COMPLIANT",
    "NON_COMPLIANT",
    "NOT_APPLICABLE",
  ];

  return (
    <div role="radiogroup" className="flex items-center gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={status === option}
          disabled={disabled}
          onClick={() => onSet(option)}
          className="h-[22px] min-h-11 w-[22px] min-w-11 rounded border border-[color:var(--border-strong)] data-[selected=true]:bg-[color:var(--primary)]"
          data-selected={status === option}
          aria-label={option.replaceAll("_", " ").toLowerCase()}
        >
          {status === option ? "✓" : ""}
        </button>
      ))}
    </div>
  );
}

export function ExaminationRegister({
  statements,
  responses,
  mode = "scale",
  disabled = false,
  binaryContext,
}: {
  statements: RegisterStatement[];
  responses: Record<string, RegisterResponse>;
  mode?: "scale" | "binary";
  disabled?: boolean;
  binaryContext?: {
    engagementId: string;
    recordId: string;
    canRespond: boolean;
  };
}) {
  const initialRows = useMemo(
    () =>
      Object.fromEntries(
        statements.map((statement) => [
          statement.id,
          responses[statement.id] ?? { status: null, remarks: null },
        ]),
      ) as Record<string, RegisterResponse>,
    [responses, statements],
  );

  const [rows, setRows] =
    useState<Record<string, RegisterResponse>>(initialRows);
  const [savedRows, setSavedRows] =
    useState<Record<string, RegisterResponse>>(initialRows);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setRows(initialRows);
    setSavedRows(initialRows);
  }, [initialRows]);

  const saveBinary = (
    statementId: string,
    status: BinaryStatus,
    remarks: string | null,
    rollback: RegisterResponse,
    attempted: RegisterResponse,
  ) => {
    if (!binaryContext?.canRespond || disabled) {
      return;
    }

    startTransition(async () => {
      const result = await saveAccountExamResponse({
        engagementId: binaryContext.engagementId,
        loanAccountId: binaryContext.recordId,
        questionId: statementId,
        status,
        note: remarks,
      });

      if (!result.success) {
        setSaveError(result.error);
        setRows((current) => {
          const live = current[statementId];
          if (
            live?.status === attempted.status &&
            live?.remarks === attempted.remarks
          ) {
            return { ...current, [statementId]: rollback };
          }
          return current;
        });
      } else {
        setSaveError(null);
        setSavedRows((current) => ({
          ...current,
          [statementId]: attempted,
        }));
      }
    });
  };

  const setStatus = (statementId: string, nextStatus: RegisterStatus) => {
    const previous = rows[statementId] ?? { status: null, remarks: null };
    const previousSaved = savedRows[statementId] ?? {
      status: null,
      remarks: null,
    };
    const next = { ...previous, status: nextStatus };
    setRows((current) => ({ ...current, [statementId]: next }));

    if (mode === "binary") {
      saveBinary(
        statementId,
        nextStatus as BinaryStatus,
        next.remarks,
        previousSaved,
        next,
      );
    }
  };

  const setRemarks = (statementId: string, nextRemarks: string) => {
    const next = {
      ...(rows[statementId] ?? { status: null, remarks: null }),
      remarks: nextRemarks || null,
    };
    setRows((current) => ({ ...current, [statementId]: next }));
  };

  const renderTick = (statementId: string, status: RegisterStatus) => {
    if (mode === "binary") {
      return (
        <BinaryTick
          status={(status as BinaryStatus | null) ?? null}
          disabled={disabled || !binaryContext?.canRespond || isPending}
          onSet={(next) => setStatus(statementId, next)}
        />
      );
    }

    return (
      <ScaleTick
        status={(status as ScaleStatus | null) ?? null}
        disabled={disabled || isPending}
        onSet={(next) => setStatus(statementId, next)}
      />
    );
  };

  const statusHeadings =
    mode === "binary"
      ? ["Compliant", "Violation", "N/A"]
      : ["Fully", "Largely", "Partially", "Non", "N/A"];

  return (
    <div className="space-y-3">
      {saveError ? (
        <p role="alert" aria-live="polite" className="text-sm text-red-600">
          {saveError}
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40 border-b text-left">
              <th className="px-3 py-2 font-medium">Statement</th>
              <th className="px-3 py-2 font-medium">Score</th>
              {statusHeadings.map((heading) => (
                <th key={heading} className="px-1 py-2 text-center font-medium">
                  {heading}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {statements.map((statement) => {
              const row = rows[statement.id] ?? { status: null, remarks: null };
              return (
                <tr
                  key={statement.id}
                  id={statement.code}
                  className="border-b align-top"
                >
                  <td className="px-3 py-3">
                    <p className="font-medium">{statement.code}</p>
                    <p>{statement.text}</p>
                  </td>
                  <td className="px-3 py-3">
                    {renderTick(statement.id, row.status)}
                  </td>
                  {statusHeadings.map((heading, index) => (
                    <td
                      key={`${statement.id}-${heading}`}
                      className="px-1 py-3 text-center"
                    >
                      {mode === "binary"
                        ? ["COMPLIANT", "VIOLATION", "NOT_APPLICABLE"][
                            index
                          ] === row.status
                          ? "●"
                          : ""
                        : [
                              "FULLY_COMPLIANT",
                              "LARGELY_COMPLIANT",
                              "PARTIALLY_COMPLIANT",
                              "NON_COMPLIANT",
                              "NOT_APPLICABLE",
                            ][index] === row.status
                          ? "●"
                          : ""}
                    </td>
                  ))}
                  <td className="px-3 py-3">
                    <StateWord status={row.status} />
                  </td>
                  <td className="px-3 py-3">
                    <textarea
                      value={row.remarks ?? ""}
                      onChange={(event) =>
                        setRemarks(statement.id, event.target.value)
                      }
                      onBlur={() => {
                        if (mode !== "binary" || !row.status) {
                          return;
                        }

                        const current = rows[statement.id] ?? {
                          status: null,
                          remarks: null,
                        };
                        const lastSaved = savedRows[statement.id] ?? {
                          status: null,
                          remarks: null,
                        };

                        if (
                          current.status === lastSaved.status &&
                          current.remarks === lastSaved.remarks
                        ) {
                          return;
                        }

                        saveBinary(
                          statement.id,
                          current.status as BinaryStatus,
                          current.remarks,
                          lastSaved,
                          current,
                        );
                      }}
                      placeholder="Add remarks"
                      className="min-h-16 w-full rounded border border-[color:var(--border)] p-2 text-sm"
                      disabled={
                        disabled ||
                        (mode === "binary" && !binaryContext?.canRespond)
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
