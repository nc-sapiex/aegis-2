import { execSync } from "child_process";

/**
 * Prepare the integration database once per run: schema, roles and the
 * non-Prisma objects, then a hard assertion that they are present.
 *
 * DATABASE_OWNER_URL: superuser or owner, used for push/bootstrap/verify.
 * DATABASE_URL: the aegis_app connection the code under test uses.
 * DATABASE_SYSTEM_URL/DATABASE_SYSTEM_PASSWORD: the aegis_system (BYPASSRLS)
 * connection for the handful of cross-tenant/pre-auth reads.
 */
export default function setup() {
  const owner = process.env.DATABASE_OWNER_URL;
  const app = process.env.DATABASE_URL;
  const appPassword = process.env.DATABASE_APP_PASSWORD;
  const systemPassword = process.env.DATABASE_SYSTEM_PASSWORD;
  if (!owner || !app || !appPassword || !systemPassword) {
    throw new Error(
      "DATABASE_OWNER_URL, DATABASE_URL, DATABASE_APP_PASSWORD and DATABASE_SYSTEM_PASSWORD are required. Example:\n" +
        "  docker run -d --name aegis-test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=aegis_test -p 55432:5432 postgres:16-alpine\n" +
        "  export DATABASE_OWNER_URL=postgresql://postgres:test@localhost:55432/aegis_test\n" +
        "  export DATABASE_APP_PASSWORD=apppassword-apppassword\n" +
        "  export DATABASE_URL=postgresql://aegis_app:apppassword-apppassword@localhost:55432/aegis_test",
    );
  }
  const run = (cmd: string) =>
    execSync(cmd, { stdio: "inherit", env: process.env });
  run("npx prisma db push --force-reset");
  run("npx tsx scripts/db-bootstrap.ts");
  run("npx tsx scripts/db-verify.ts");
}
