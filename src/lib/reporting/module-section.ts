import type { ScoreLabel } from "@/generated/prisma/enums";
import { computeModuleScore, type ScoredNode } from "@/lib/rbia-scoring-engine";
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
  compliantCount?: number | null;
  violationCount?: number | null;
};
export type ModuleSectionData = {
  moduleName: string;
  kind: string;
  /** null when no statement in the module has been scored yet ("Not Examined"). */
  score: number | null;
  rows: {
    code: string;
    text: string;
    result: string;
    weight: number;
    isCritical: boolean;
    compliantCount: number | null;
    violationCount: number | null;
  }[];
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
      weight: statement.weight,
      isCritical: statement.isCritical,
      compliantCount: response?.compliantCount ?? null,
      violationCount: response?.violationCount ?? null,
    };
  });

  // Weighted roll-up with the critical-item cap, same engine the freeze
  // snapshot and live scoring UI use — a module here is just a one-level
  // ScoredNode tree (leaves are statements, no nesting at report time).
  const moduleNode: ScoredNode = {
    nodeId: module.code,
    code: module.code,
    weight: 1,
    isCritical: false,
    isLeaf: false,
    children: statements.map((statement) => {
      const key = statement.nodeId ?? statement.questionId ?? "";
      const response = responseByStatementId.get(key);
      return {
        nodeId: key,
        code: statement.displayCode ?? key,
        weight: statement.weight,
        isCritical: statement.isCritical,
        isLeaf: true,
        scoreLabel: (response?.scoreLabel as ScoreLabel | null) ?? null,
        children: [],
      };
    }),
  };
  const score = computeModuleScore(moduleNode);

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
    compliantCount: s.compliantCount,
    violationCount: s.violationCount,
  }));
  return buildModuleSection(
    { code: module.code, name: module.name, kinds: module.kinds },
    statements,
    responses,
  );
}
