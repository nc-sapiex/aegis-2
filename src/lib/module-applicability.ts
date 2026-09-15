/**
 * Branch fields an AuditModule.applicability predicate can reference.
 * Mirrors the Prisma Branch profile columns (spec §6.2).
 */
export type BranchProfile = {
  hasForex: boolean;
  hasCurrencyChest: boolean;
  hasGovtBusiness: boolean;
  hasLockers: boolean;
  hasAtm: boolean;
  loanProducts: string[];
};

type Predicate = Record<string, boolean | { contains: string }>;

/**
 * Evaluates an AuditModule.applicability JSON predicate against a branch
 * profile. {} always matches. Every key is ANDed. A boolean value must equal
 * the branch's field; a { contains } value must be present in an array field.
 */
export function evaluateApplicability(
  predicate: unknown,
  branch: BranchProfile,
): boolean {
  const rules = (predicate ?? {}) as Predicate;
  const keys = Object.keys(rules);
  if (keys.length === 0) return true;

  return keys.every((key) => {
    const rule = rules[key];
    const branchValue = branch[key as keyof BranchProfile];

    if (typeof rule === "boolean") {
      return branchValue === rule;
    }
    if (rule && typeof rule === "object" && "contains" in rule) {
      return Array.isArray(branchValue) && branchValue.includes(rule.contains);
    }
    return false;
  });
}
