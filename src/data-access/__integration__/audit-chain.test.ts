import { beforeEach, describe, expect, it } from "vitest";
import {
  systemActor,
  withAuditedMutation,
} from "@/data-access/audited-mutation";
import { detectAuditGaps } from "@/data-access/audit-trail";
import { verifyTenantAuditChain } from "@/jobs/verify-audit-chain";
import {
  createTenant,
  integrationOwner,
  resetDatabase,
} from "../../../tests/integration/harness";

/**
 * Spec §5's tamper tests, end to end: real audited writes through the trigger,
 * verified by the real job, which recomputes every hash in TypeScript. The
 * clean case is therefore also the standing proof that the SQL trigger and
 * src/lib/audit-chain.ts build byte-identical canonical strings, including
 * multi-byte text, a "|" in a value, and jsonb numerics.
 */
let tenantId: string;

beforeEach(async () => {
  await resetDatabase();
  tenantId = (await createTenant("Chain Test Bank")).id;

  const created: { id: string }[] = [];
  for (const code of ["B001", "B002"]) {
    created.push(
      await withAuditedMutation(systemActor(tenantId), "branch.created", (tx) =>
        tx.branch.create({
          data: {
            tenantId,
            code,
            name: `शाखा ${code} | "Main"`,
            city: "Pune",
            state: "Maharashtra",
          },
          select: { id: true },
        }),
      ),
    );
  }
  await withAuditedMutation(
    systemActor(tenantId),
    "branch.updated",
    (tx) =>
      tx.branch.update({
        where: { id: created[0].id },
        data: { city: "Nashik" },
      }),
    "Relocated",
  );
});

async function tamper(sql: string, rule: "update" | "delete") {
  await integrationOwner.$executeRawUnsafe(
    `ALTER TABLE "AuditLog" DISABLE RULE audit_log_no_${rule}`,
  );
  try {
    await integrationOwner.$executeRawUnsafe(sql, tenantId);
  } finally {
    await integrationOwner.$executeRawUnsafe(
      `ALTER TABLE "AuditLog" ENABLE RULE audit_log_no_${rule}`,
    );
  }
}

describe("audit chain", () => {
  it("three audited writes verify clean", async () => {
    expect(await integrationOwner.auditLog.count({ where: { tenantId } })).toBe(
      3,
    );

    expect(await verifyTenantAuditChain(tenantId, { full: true })).toEqual({
      ok: true,
    });
    expect(await detectAuditGaps(tenantId)).toEqual([]);
    const [recorded] = await integrationOwner.auditChainVerification.findMany({
      where: { tenantId },
    });
    expect(recorded).toMatchObject({ ok: true, firstBadSequence: null });
  });

  it("the immutability rules silently discard an ordinary UPDATE and DELETE", async () => {
    await integrationOwner.$executeRawUnsafe(
      `UPDATE "AuditLog" SET "actionType" = 'tampered' WHERE "tenantId" = $1::uuid`,
      tenantId,
    );
    await integrationOwner.$executeRawUnsafe(
      `DELETE FROM "AuditLog" WHERE "tenantId" = $1::uuid`,
      tenantId,
    );

    expect(
      await integrationOwner.auditLog.count({
        where: { tenantId, actionType: { not: "tampered" } },
      }),
    ).toBe(3);
  });

  it("a superuser UPDATE of a middle row is reported by row", async () => {
    await tamper(
      `UPDATE "AuditLog" SET "actionType" = 'tampered' WHERE "tenantId" = $1::uuid AND "sequenceNumber" = 2`,
      "update",
    );

    expect(await verifyTenantAuditChain(tenantId, { full: true })).toEqual({
      ok: false,
      firstBadSequence: 2n,
    });
  });

  it("a superuser DELETE is reported by both gap and chain", async () => {
    await tamper(
      `DELETE FROM "AuditLog" WHERE "tenantId" = $1::uuid AND "sequenceNumber" = 2`,
      "delete",
    );

    expect(await detectAuditGaps(tenantId)).toEqual([{ missingSequence: 2n }]);
    // The chain breaks at the next surviving row, whose prevHash names the
    // deleted one.
    expect(await verifyTenantAuditChain(tenantId, { full: true })).toEqual({
      ok: false,
      firstBadSequence: 3n,
    });
  });
});
