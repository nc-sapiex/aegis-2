/**
 * Apply every non-Prisma database object, in manifest order.
 *
 * Usage: pnpm db:bootstrap
 * Requires DATABASE_URL. Safe to re-run — every file in the manifest is
 * idempotent, which is a precondition for being in the manifest at all.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";
import { SQL_MANIFEST } from "../prisma/sql/manifest";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const client = new Client({ connectionString });
  await client.connect();

  try {
    for (const relativePath of SQL_MANIFEST) {
      const sql = readFileSync(join(process.cwd(), relativePath), "utf-8");
      process.stdout.write(`applying ${relativePath} ... `);
      await client.query(sql);
      process.stdout.write("ok\n");
    }
  } finally {
    await client.end();
  }

  console.log(`\n${SQL_MANIFEST.length} SQL files applied.`);
}

main().catch((error) => {
  console.error("\nbootstrap failed:", error);
  process.exit(1);
});
