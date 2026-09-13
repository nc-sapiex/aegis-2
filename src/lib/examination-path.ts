/**
 * ExaminationNode.path is slash-separated (`ROOT/CREDIT/CREDIT-001`,
 * `OPS/OPS-KYC/OPS-KYC-001`). The schema comment and the CHECK constraint
 * (`path LIKE '%/' || code OR path = code`) agree. Lookups that append "."
 * never match a child row.
 */

/** Prefix that matches every descendant of `modulePath` in a startsWith query. */
export function descendantPathPrefix(modulePath: string): string {
  return modulePath.endsWith("/") ? modulePath : `${modulePath}/`;
}

/** True when `leafPath` is the module itself or a child under it. */
export function isDescendantPath(
  leafPath: string,
  modulePath: string,
): boolean {
  return (
    leafPath === modulePath ||
    leafPath.startsWith(descendantPathPrefix(modulePath))
  );
}
