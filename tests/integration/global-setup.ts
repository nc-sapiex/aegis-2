import { execSync } from "child_process";

/**
 * Prepare the integration database once per run: schema, then the non-Prisma
 * objects, then a hard assertion that they are present. Without the bootstrap
 * the audit trigger is absent and every audited write silently proves nothing.
 */
export default function setup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for integration tests. Start one with:\n" +
        "  docker run -d --name aegis-test -e POSTGRES_PASSWORD=test " +
        "-e POSTGRES_DB=aegis_test -p 55432:5432 postgres:16-alpine\n" +
        "  export DATABASE_URL=postgresql://postgres:test@localhost:55432/aegis_test",
    );
  }

  const run = (cmd: string) =>
    execSync(cmd, { stdio: "inherit", env: process.env });

  run("npx prisma db push --force-reset");
  run("npx tsx scripts/db-bootstrap.ts");
  run("npx tsx scripts/db-verify.ts");
}
