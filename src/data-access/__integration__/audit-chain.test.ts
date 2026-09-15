import { beforeEach, describe, expect, it } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
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
 *
 * The writes run under an Asia/Kolkata session while the verify job reads on
 * other connections. CI's Postgres runs in UTC, so without this a trigger that
 * stored a timestamptz through the session TimeZone again (every row
 * false-tampers on a non-UTC server) would still pass.
 */
let tenantId: string;

const inIst = (tx: Prisma.TransactionClient) =>
  tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Asia/Kolkata'`);

beforeEach(async () => {
  await resetDatabase();
  tenantId = (await createTenant("Chain Test Bank")).id;

  const created: { id: string }[] = [];
  for (const code of ["B001", "B002"]) {
    created.push(
      await withAuditedMutation(
        systemActor(tenantId),
        "branch.created",
        async (tx) => {
          await inIst(tx);
          return tx.branch.create({
            data: {
              tenantId,
              code,
              name: `शाखा ${code} | "Main"`,
              city: "Pune",
              state: "Maharashtra",
            },
            select: { id: true },
          });
        },
      ),
    );
  }
  await withAuditedMutation(
    systemActor(tenantId),
    "branch.updated",
    async (tx) => {
      await inIst(tx);
      return tx.branch.update({
        where: { id: created[0].id },
        data: { city: "Nashik" },
      });
    },
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

  it("SQL hashes the fixed test vector to the digest pinned in the unit suite", async () => {
    // Same vector as src/lib/__tests__/audit-chain.test.ts's fixed test.
    const [{ hex }] = await integrationOwner.$queryRawUnsafe<{ hex: string }[]>(
      `SELECT encode(audit_chain_row_hash(
         decode(repeat('00', 32), 'hex'),
         '44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 1,
         'Branch', '22222222-2222-4222-8222-222222222222', 'INSERT', 'branch.created', NULL,
         '33333333-3333-4333-8333-333333333333', '127.0.0.1', 'sess-1', NULL,
         '{"code": "A001", "name": "A Branch"}',
         '2026-09-13 10:15:30.123', '2036-09-13 10:15:30.123'
       ), 'hex') AS hex`,
    );
    expect(hex).toBe(
      "4d20a0c3c151e7f9c12a5d6bb80af430892fcc78a06b5eb830ad3b770c8d3ca9",
    );
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
