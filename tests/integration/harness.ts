import { randomUUID } from "crypto";
import { vi } from "vitest";
import type { Role } from "@/generated/prisma/enums";
import { withTriggersDetached } from "@/lib/audit-triggers";
import { prisma } from "@/lib/prisma";

/**
 * The application's own client, not a second one.
 *
 * This project runs Prisma 7 with the `@prisma/adapter-pg` driver adapter
 * (see `src/lib/prisma.ts`), so a bare `new PrismaClient()` throws. Reusing the
 * singleton also keeps assertions on the same pool as the code under test, so
 * a test cannot read a snapshot the action has not committed yet.
 */
export const integrationPrisma = prisma;

/**
 * Build fixtures with the audit triggers suspended.
 *
 * Fixture rows are preconditions, not audited actions. `audit_trigger_function`
 * normalises a missing tenant context to NULL, which violates
 * `AuditLog.tenantId NOT NULL`, so an unwrapped write to an audited table
 * throws — by design. The action under test still runs with the triggers
 * attached, which is the point of these suites.
 *
 * `withTriggersDetached` is not re-entrant (it reads pg_trigger without
 * checking `tgenabled`, so a nested call re-enables on its way out while the
 * outer block is still writing). Fixture helpers call each other freely, so
 * this depth guard makes only the outermost call touch DDL. Integration tests
 * run single-worker (`fileParallelism: false`, `maxWorkers: 1`), so a
 * module-level counter is sufficient — there is no second worker to race.
 */
let fixtureDepth = 0;

export async function withFixtures<T>(fn: () => Promise<T>): Promise<T> {
  if (fixtureDepth > 0) return fn();
  fixtureDepth++;
  try {
    return await withTriggersDetached(integrationPrisma, fn);
  } finally {
    fixtureDepth--;
  }
}

export interface AuthSessionLike {
  user: { id: string; tenantId: string; roles: string[] };
  session: { id: string };
}

/**
 * Tables are truncated rather than dropped: the schema, triggers, views and
 * constraints from global setup must survive between tests.
 */
export async function resetDatabase(): Promise<void> {
  const tables = await integrationPrisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
     WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;
  const quoted = tables.map((t) => `"${t.tablename}"`).join(", ");
  // AuditLog carries no delete rule in this project, so a plain TRUNCATE works.
  await integrationPrisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`,
  );
}

export async function createTenant(name = "Test Cooperative Bank") {
  return withFixtures(() =>
    integrationPrisma.tenant.create({
      data: {
        name,
        shortName: name.slice(0, 12),
        rbiLicenseNo: randomUUID(),
        tier: "TIER_1",
        state: "Maharashtra",
        city: "Mumbai",
      },
      select: { id: true },
    }),
  );
}

export async function createUser(tenantId: string, roles: string[]) {
  const email = `user-${randomUUID()}@example.test`;
  return withFixtures(() =>
    integrationPrisma.user.create({
      data: {
        email,
        name: "Test User",
        tenantId,
        roles: roles as Role[],
        status: "ACTIVE",
        emailVerified: true,
      },
      select: { id: true, email: true },
    }),
  );
}

export function fakeSession(user: {
  id: string;
  tenantId: string;
  roles: string[];
}): AuthSessionLike {
  return { user, session: { id: randomUUID() } };
}

/**
 * Put a user on an engagement's audit team. Actions guarded by
 * `requireTeamMembership` (e.g. saveAccountExamResponse) reject a caller who
 * holds the right role but is not assigned to the specific engagement, so
 * fixtures for the write path must add this row.
 */
export async function addTeamMember(
  tenantId: string,
  engagementId: string,
  userId: string,
  roleInEngagement = "FIELD_AUDITOR",
) {
  return withFixtures(() =>
    integrationPrisma.auditTeamMember.create({
      data: {
        tenantId,
        engagementId,
        userId,
        roleInEngagement,
        assignedSections: [],
      },
      select: { id: true },
    }),
  );
}

/**
 * Point `getRequiredSession()` at a fixture. Call before importing the action
 * under test, or use `vi.resetModules()` between switches of identity.
 */
export function mockSessionModule(session: AuthSessionLike): void {
  vi.doMock("@/data-access/session", () => ({
    getRequiredSession: vi.fn(async () => session),
  }));
  vi.doMock("next/cache", () => ({
    revalidatePath: vi.fn(),
    revalidateTag: vi.fn(),
  }));
}
