import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";

export type EngagementStatementLike = {
  nodeId: string | null;
  questionId: string | null;
  text: string;
  weight: number;
  isCritical: boolean;
};

export type ResponseLike = {
  nodeId?: string | null;
  questionId?: string | null;
  accountRecordId?: string | null;
  scoreLabel: string | null;
};

export type ModuleSectionData = {
  moduleName: string;
  kind: string;
  score: number;
  rows: { code: string; text: string; result: string }[];
};

export function buildModuleSection(
  module: { code: string; name: string; kinds: string[] },
  statements: EngagementStatementLike[],
  responses: ResponseLike[],
): ModuleSectionData {
  const responseByStatementId = new Map<string, ResponseLike>();

  for (const response of responses) {
    const key = response.nodeId ?? response.questionId ?? "";
    if (key) {
      responseByStatementId.set(key, response);
    }
  }

  const rows = statements.map((statement) => {
    const key = statement.nodeId ?? statement.questionId ?? "";
    const response = responseByStatementId.get(key);

    return {
      code: key,
      text: statement.text,
      result: response?.scoreLabel ?? "unscored",
    };
  });

  const scored = rows.filter(
    (row) => row.result !== "unscored" && row.result in SCORE_VALUES,
  );
  const score =
    scored.length > 0
      ? scored.reduce(
          (sum, row) => sum + SCORE_VALUES[row.result as keyof typeof SCORE_VALUES],
          0,
        ) / scored.length
      : 0;

  return {
    moduleName: module.name,
    kind: module.kinds.join("/"),
    score,
    rows,
  };
}
