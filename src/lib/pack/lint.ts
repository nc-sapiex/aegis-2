import type { PackFiles } from "./types";

export type LintResult = { ok: true } | { ok: false; errors: string[] };

/**
 * Structural and semantic validation beyond what Zod's per-file schemas check
 * (spec §7.1: "unique codes, consistent paths, weights in range, applicability
 * predicates well-formed"). Zod already enforces per-record shape and weight
 * range; this checks relationships ACROSS records.
 */
export function lintPack(files: PackFiles): LintResult {
  const errors: string[] = [];
  const moduleCodes = new Set(files.modules.map((m) => m.code));

  const seenNodeCodes = new Set<string>();
  for (const node of files.nodes) {
    if (seenNodeCodes.has(node.code))
      errors.push(`duplicate node code: ${node.code}`);
    seenNodeCodes.add(node.code);

    if (!moduleCodes.has(node.moduleCode)) {
      errors.push(
        `node ${node.code} references undeclared module: ${node.moduleCode}`,
      );
    } else if (!node.path.startsWith(node.moduleCode)) {
      errors.push(
        `node ${node.code} has path "${node.path}" that does not start with its module code "${node.moduleCode}"`,
      );
    }
  }

  const seenQuestionCodes = new Set<string>();
  for (const question of files.questions) {
    if (seenQuestionCodes.has(question.code))
      errors.push(`duplicate question code: ${question.code}`);
    seenQuestionCodes.add(question.code);
    if (!moduleCodes.has(question.moduleCode)) {
      errors.push(
        `question ${question.code} references undeclared module: ${question.moduleCode}`,
      );
    }
  }

  for (const populationSchema of files.populationSchemas) {
    if (!moduleCodes.has(populationSchema.moduleCode)) {
      errors.push(
        `population schema references undeclared module: ${populationSchema.moduleCode}`,
      );
    }
  }

  for (const mod of files.modules) {
    const predicateErrors = lintApplicabilityPredicate(
      mod.code,
      mod.applicability,
    );
    errors.push(...predicateErrors);
  }

  const declaredButUnused = [...moduleCodes].filter(
    (code) =>
      !files.nodes.some((n) => n.moduleCode === code) &&
      !files.questions.some((q) => q.moduleCode === code),
  );
  for (const code of declaredButUnused) {
    errors.push(
      `module ${code} is declared in provides but has no nodes or questions`,
    );
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function lintApplicabilityPredicate(
  moduleCode: string,
  predicate: Record<string, unknown>,
): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(predicate)) {
    const isBoolean = typeof value === "boolean";
    const isContainsClause =
      value !== null &&
      typeof value === "object" &&
      "contains" in value &&
      typeof (value as { contains: unknown }).contains === "string";
    if (!isBoolean && !isContainsClause) {
      errors.push(
        `module ${moduleCode} has a malformed applicability predicate for key "${key}": must be a boolean or { contains: string }`,
      );
    }
  }
  return errors;
}
