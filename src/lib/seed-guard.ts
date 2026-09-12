interface SeedGuardInput {
  nodeEnv?: string;
  databaseUrl?: string;
  allowDestructiveSeed?: string;
}

function getDatabaseName(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
}

export function assertSafeSeedTarget(input: SeedGuardInput) {
  if (!input.databaseUrl) {
    throw new Error("DATABASE_URL is required for seeding");
  }

  if (input.allowDestructiveSeed === "true") {
    return;
  }

  const nodeEnv = input.nodeEnv ?? "development";
  const databaseName = getDatabaseName(input.databaseUrl);
  const productionLikeDatabaseName =
    /(^|[_-])(prod|production|live)([_-]|$)/i.test(databaseName);

  if (nodeEnv === "production" || productionLikeDatabaseName) {
    throw new Error(
      `Refusing to run destructive seed against NODE_ENV=\"${nodeEnv}\" and database \"${databaseName}\". Set ALLOW_DESTRUCTIVE_SEED=true only if you fully understand the risk.`,
    );
  }
}
