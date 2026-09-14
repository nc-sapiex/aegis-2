import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "crypto";
import { setAuditContext } from "@/data-access/audit-context";
import { prismaForTenant } from "@/lib/prisma";
import {
  resetDatabase,
  createTenant,
  createUser,
  integrationPrisma,
  integrationOwner,
} from "../../../tests/integration/harness";

/**
 * What `prismaForTenant` promises, against a live database.
 *
 * The unit suite can only check the shape of the calls. These are the claims
 * that shape cannot prove, and that a per-operation wrapper silently breaks:
 * a transaction is one transaction, a throw inside it rolls everything back,
 * and the session GUCs a caller sets on `tx` are visible to the audit trigger
 * that fires on the write.
 *
 * These also pin a Prisma internal. `createTenantClient` reads
 * `__internalParams.transaction` to tell whether an operation is already inside
 * a transaction, which is not covered by Prisma's semver. If a `@prisma/client`
 * bump changes that field's shape the wrapper silently re-wraps everything, and
 * the rollback and audit-attribution cases below are what fail. Keep them.
 *
 * The failure being guarded is not a crash. A wrapper that moves each
 * operation onto its own connection still writes the row and still writes an
 * AuditLog entry — with `actionType` and `userId` null, because the trigger
 * read them from a connection where `setAuditContext` never ran. The write
 * succeeds, the audit trail is anonymous, and nothing raises. Hence the
 * assertions below are on the *content* of the audit row, not its existence.
 */
describe("prismaForTenant against PostgreSQL", () => {
  let tenantId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    const tenant = await createTenant();
    tenantId = tenant.id;
    const user = await createUser(tenantId, ["SYSTEM_ADMIN"]);
    userId = user.id;
  });

  const branch = (code: string) => ({
    tenantId,
    code,
    name: `Branch ${code}`,
    city: "Mumbai",
    state: "Maharashtra",
  });

  describe("$transaction(callback)", () => {
    it("rolls the whole transaction back when the callback throws", async () => {
      const db = prismaForTenant(tenantId);
      const code = `BR-${randomUUID().slice(0, 8)}`;

      await expect(
        db.$transaction(async (tx) => {
          await tx.branch.create({ data: branch(code) });
          throw new Error("deliberate abort");
        }),
      ).rejects.toThrow("deliberate abort");

      expect(await integrationOwner.branch.count({ where: { code } })).toBe(0);
      // The trigger's own row must go with it, or the log records a write that
      // never happened.
      expect(
        await integrationOwner.auditLog.count({
          where: { tableName: "Branch" },
        }),
      ).toBe(0);
    });

    it("commits every write in the transaction together", async () => {
      const db = prismaForTenant(tenantId);
      const a = `BR-${randomUUID().slice(0, 8)}`;
      const b = `BR-${randomUUID().slice(0, 8)}`;

      await db.$transaction(async (tx) => {
        await tx.branch.create({ data: branch(a) });
        await tx.branch.create({ data: branch(b) });
      });

      expect(
        await integrationOwner.branch.count({
          where: { code: { in: [a, b] } },
        }),
      ).toBe(2);
    });

    it("carries setAuditContext through to the audit trigger", async () => {
      const db = prismaForTenant(tenantId);
      const code = `BR-${randomUUID().slice(0, 8)}`;
      const sessionId = randomUUID();

      await db.$transaction(async (tx) => {
        await setAuditContext(tx, {
          actionType: "branch.created",
          userId,
          tenantId,
          sessionId,
        });
        await tx.branch.create({ data: branch(code) });
      });

      const entries = await integrationOwner.auditLog.findMany({
        where: { tableName: "Branch" },
        select: {
          actionType: true,
          userId: true,
          tenantId: true,
          operation: true,
        },
      });

      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        actionType: "branch.created",
        userId,
        tenantId,
        operation: "INSERT",
      });
    });

    it("sets the tenant GUC for reads inside the transaction", async () => {
      const db = prismaForTenant(tenantId);

      const seen = await db.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { guc: string }[]
        >`SELECT current_setting('app.current_tenant_id', true) AS guc`;
        return rows[0]?.guc;
      });

      expect(seen).toBe(tenantId);
    });

    // The direct form of the same claim: two operations in one transaction must
    // report the same transaction id. A per-operation wrapper gives each its own
    // transaction on its own connection, so the two ids differ — which is the
    // mechanism behind both the lost rollback and the lost audit context.
    it("runs every operation in the transaction under one transaction id", async () => {
      const db = prismaForTenant(tenantId);

      const [first, second] = await db.$transaction(async (tx) => {
        const a = await tx.$queryRaw<
          { txid: string }[]
        >`SELECT txid_current()::text AS txid`;
        const b = await tx.$queryRaw<
          { txid: string }[]
        >`SELECT txid_current()::text AS txid`;
        return [a[0]?.txid, b[0]?.txid];
      });

      expect(first).toBeDefined();
      expect(second).toBe(first);
    });
  });

  describe("$transaction(array)", () => {
    it("returns results aligned with the caller's own operations", async () => {
      const db = prismaForTenant(tenantId);
      const code = `BR-${randomUUID().slice(0, 8)}`;
      await db.$transaction(async (tx) => {
        await tx.branch.create({ data: branch(code) });
      });

      const [branches, count] = await db.$transaction([
        db.branch.findMany({ where: { tenantId } }),
        db.branch.count({ where: { tenantId } }),
      ]);

      // A prepended GUC statement whose result is not stripped would shift
      // both of these by one.
      expect(Array.isArray(branches)).toBe(true);
      expect(branches).toHaveLength(1);
      expect(count).toBe(1);
    });

    // Alignment alone would still pass if each operation were re-wrapped in its
    // own batch. These two assert the batch is really shared: the GUC set by the
    // prepended statement is visible to the caller's operations, and both run
    // under one transaction id.
    it("carries the tenant GUC into the caller's operations", async () => {
      const db = prismaForTenant(tenantId);

      const [rows] = await db.$transaction([
        db.$queryRaw<
          { guc: string }[]
        >`SELECT current_setting('app.current_tenant_id', true) AS guc`,
      ]);

      expect(rows[0]?.guc).toBe(tenantId);
    });

    it("runs the caller's operations under one transaction id", async () => {
      const db = prismaForTenant(tenantId);

      const [a, b] = await db.$transaction([
        db.$queryRaw<{ txid: string }[]>`SELECT txid_current()::text AS txid`,
        db.$queryRaw<{ txid: string }[]>`SELECT txid_current()::text AS txid`,
      ]);

      expect(a[0]?.txid).toBeDefined();
      expect(b[0]?.txid).toBe(a[0]?.txid);
    });
  });

  describe("standalone operations", () => {
    it("runs with the tenant GUC set", async () => {
      const db = prismaForTenant(tenantId);

      const rows = await db.$queryRaw<
        { guc: string }[]
      >`SELECT current_setting('app.current_tenant_id', true) AS guc`;

      expect(rows[0]?.guc).toBe(tenantId);
    });

    it("does not leak the tenant GUC back onto the pooled connection", async () => {
      const db = prismaForTenant(tenantId);
      await db.branch.findMany({ where: { tenantId } });

      // `set_config(..., TRUE)` is transaction-local; the session GUC reads
      // back as '' rather than NULL once that transaction ends.
      const rows = await integrationPrisma.$queryRaw<
        { guc: string }[]
      >`SELECT current_setting('app.current_tenant_id', true) AS guc`;

      expect(rows[0]?.guc ?? "").toBe("");
    });
  });
});
