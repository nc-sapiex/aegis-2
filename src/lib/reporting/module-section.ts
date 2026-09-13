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

/**
 * Render one module's report section without branching on module identity.
 */
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

  const rows = statements.map((statement, index) => {
    const key = statement.nodeId ?? statement.questionId ?? `row-${index + 1}`;
    const response = responseByStatementId.get(key);

    return {
      code: key,
      text: statement.text,
      result: response?.scoreLabel ?? "unscored",
    };
  });

  const scoredRows = rows.filter(
    (row): row is typeof row & {
      result: keyof typeof SCORE_VALUES;
    } => row.result in SCORE_VALUES,
  );
  const score =
    scoredRows.length > 0
      ? scoredRows.reduce((sum, row) => sum + SCORE_VALUES[row.result], 0) /
        scoredRows.length
      : 0;

  return {
    moduleName: module.name,
    kind: module.kinds.join("/"),
    score,
    rows,
  };
}
