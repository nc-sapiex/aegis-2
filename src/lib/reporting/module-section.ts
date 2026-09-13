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

function pickRepresentativeResponse(
  existing: ResponseLike | undefined,
  incoming: ResponseLike,
): ResponseLike {
  if (!existing) {
    return incoming;
  }

  const existingLabel = existing.scoreLabel;
  const incomingLabel = incoming.scoreLabel;

  if (existingLabel == null) {
    return incoming;
  }

  if (incomingLabel == null) {
    return existing;
  }

  if (!(existingLabel in SCORE_VALUES)) {
    return incomingLabel in SCORE_VALUES ? incoming : existing;
  }

  if (!(incomingLabel in SCORE_VALUES)) {
    return existing;
  }

  return SCORE_VALUES[incomingLabel as keyof typeof SCORE_VALUES] <
    SCORE_VALUES[existingLabel as keyof typeof SCORE_VALUES]
    ? incoming
    : existing;
}

export function buildModuleSection(
  module: { code: string; name: string; kinds: string[] },
  statements: EngagementStatementLike[],
  responses: ResponseLike[],
): ModuleSectionData {
  const responseByStatementId = new Map<string, ResponseLike>();

  for (const response of responses) {
    const key = response.nodeId ?? response.questionId ?? "";
    if (key) {
      responseByStatementId.set(
        key,
        pickRepresentativeResponse(responseByStatementId.get(key), response),
      );
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

  let weightedSum = 0;
  let totalWeight = 0;

  for (const [index, row] of rows.entries()) {
    if (!(row.result in SCORE_VALUES)) {
      continue;
    }

    const weight = statements[index]?.weight ?? 0;
    weightedSum += SCORE_VALUES[row.result as keyof typeof SCORE_VALUES] * weight;
    totalWeight += weight;
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    moduleName: module.name,
    kind: module.kinds.join("/"),
    score,
    rows,
  };
}
