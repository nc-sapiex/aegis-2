import { SCORE_VALUES } from "@/lib/rbia-scoring-engine";
import type { ReportModule } from "@/data-access/reports";

export type EngagementStatementLike = {
  nodeId: string | null;
  questionId: string | null;
  text: string;
  weight: number;
  isCritical: boolean;
  /** Human-readable row code (e.g. "CRD-01"). Falls back to nodeId/questionId when absent. */
  displayCode?: string | null;
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
 * Renders one module's results generically — no branch on module.code
 * anywhere in this function (spec §12's reporting-genericity requirement).
 * A CHECKLIST module's rows key on nodeId/questionId; a POPULATION_SAMPLE
 * module's rows key on the same statement identity, just answered per
 * account elsewhere — this function only needs "does a response exist for
 * this statement's identity", which is the same lookup either way.
 */
export function buildModuleSection(
  module: { code: string; name: string; kinds: string[] },
  statements: EngagementStatementLike[],
  responses: ResponseLike[],
): ModuleSectionData {
  const responseByStatementId = new Map<string, ResponseLike>();
  for (const response of responses) {
    const key = response.nodeId ?? response.questionId ?? "";
    if (key) responseByStatementId.set(key, response);
  }

  const rows = statements.map((statement) => {
    const key = statement.nodeId ?? statement.questionId ?? "";
    const response = responseByStatementId.get(key);
    return {
      code: statement.displayCode ?? key,
      text: statement.text,
      result: response?.scoreLabel ?? "unscored",
    };
  });

  const scored = rows.filter(
    (r) => r.result !== "unscored" && r.result in SCORE_VALUES,
  );
  const score =
    scored.length > 0
      ? scored.reduce(
          (sum, r) => sum + SCORE_VALUES[r.result as keyof typeof SCORE_VALUES],
          0,
        ) / scored.length
      : 0;

  return { moduleName: module.name, kind: module.kinds.join("/"), score, rows };
}

/**
 * Bridges Task 8's already-joined `ReportModule` (getAuditReportData) into
 * `buildModuleSection`'s generic input shape. Each ReportModuleStatement's
 * own id is a stable, unique per-statement key — used as both the statement
 * and response identity so every statement joins to exactly its own
 * already-resolved scoreLabel (CHECKLIST response or POPULATION_SAMPLE
 * compliance tally, both resolved by Task 8 — never recomputed here).
 */
export function reportModuleToSection(module: ReportModule): ModuleSectionData {
  const statements: EngagementStatementLike[] = module.statements.map((s) => ({
    nodeId: s.id,
    questionId: null,
    text: s.text,
    weight: s.weight,
    isCritical: s.isCritical,
    displayCode: s.reference,
  }));
  const responses: ResponseLike[] = module.statements.map((s) => ({
    nodeId: s.id,
    scoreLabel: s.scoreLabel,
  }));
  return buildModuleSection(
    { code: module.code, name: module.name, kinds: module.kinds },
    statements,
    responses,
  );
}
