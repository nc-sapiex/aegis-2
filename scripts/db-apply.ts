/**
 * Apply one or more SQL files by hand, in the order given.
 *
 * Usage: pnpm db:apply prisma/sql/070_rls_policies.sql
 *
 * `db:bootstrap` applies every file in `prisma/sql/manifest.ts` itself
 * (it doesn't shell out to this script). Use this to re-apply a single
 * manifest file by hand — e.g. after editing it — without a full bootstrap
 * re-run.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";

async function main() {
  const connectionString =
    process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!connectionString)
    throw new Error("DATABASE_OWNER_URL or DATABASE_URL is required");

  const paths = process.argv.slice(2);
  if (paths.length === 0)
    throw new Error("at least one SQL file path is required");

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const path of paths) {
      const sql = readFileSync(resolve(process.cwd(), path), "utf-8");
      process.stdout.write(`applying ${path} ... `);
      await client.query(sql);
      process.stdout.write("ok\n");
    }
  } finally {
    await client.end();
  }

  console.log(`\n${paths.length} SQL file(s) applied.`);
}

main().catch((error) => {
  console.error("\napply failed:", error);
  process.exit(1);
});
