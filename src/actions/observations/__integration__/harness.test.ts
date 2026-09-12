import { beforeEach, describe, expect, it } from "vitest";
import {
  createTenant,
  createUser,
  integrationPrisma,
  resetDatabase,
} from "../../../../tests/integration/harness";

describe("integration harness", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("creates an isolated tenant and user", async () => {
    const tenant = await createTenant("Alpha Cooperative Bank");
    const user = await createUser(tenant.id, ["AUDITOR"]);

    const found = await integrationPrisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { tenantId: true, roles: true },
    });

    expect(found.tenantId).toBe(tenant.id);
    expect(found.roles).toEqual(["AUDITOR"]);
  });

  it("truncates between tests", async () => {
    const count = await integrationPrisma.tenant.count();
    expect(count).toBe(0);
  });

  it("has the audit trigger attached", async () => {
    const rows = await integrationPrisma.$queryRawUnsafe<{ relname: string }[]>(
      `SELECT c.relname FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
        WHERE t.tgname = 'audit_trigger' AND NOT t.tgisinternal`,
    );

    expect(rows.map((row) => row.relname)).toContain("Observation");
  });
});
