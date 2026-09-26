type UninstallResult = { success: true } | { success: false; error: string };

/**
 * Confirms with the operator, then calls the given uninstall function.
 * Deliberately takes both dependencies as parameters, rather than importing
 * uninstallPackAction itself, so this stays a plain module a unit test can
 * import without pulling in the "use server" action's own import chain
 * (getRequiredSession -> @/lib/auth, which initializes better-auth's Prisma
 * adapter at module load and throws without DATABASE_SYSTEM_URL — fine for
 * the real app, fatal for a vitest run that only sets the env vars src/env.ts
 * itself needs). Returns null when the operator cancels the confirm dialog.
 */
export async function confirmAndUninstall(
  packCode: string,
  packName: string,
  deps: {
    confirm: (message: string) => boolean;
    uninstallPackAction: (packCode: string) => Promise<UninstallResult>;
  },
): Promise<UninstallResult | null> {
  const confirmed = deps.confirm(
    `Uninstall ${packName}? Its modules turn off for engagements created from ` +
      `now on. An engagement already underway keeps the statement set it started with.`,
  );
  if (!confirmed) return null;
  return deps.uninstallPackAction(packCode);
}
