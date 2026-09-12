import type { Role } from "@/generated/prisma/enums";

/**
 * Fixed identifiers for tests.
 *
 * prismaForTenant rejects anything that is not a v4-shaped UUID, so these must
 * stay well-formed even though no database sees them.
 */
export const TENANT_A = "11111111-1111-4111-8111-111111111111";
export const TENANT_B = "22222222-2222-4222-8222-222222222222";
export const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const BRANCH_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
export const BRANCH_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
export const SESSION_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
export const ENGAGEMENT_A = "ffffffff-ffff-4fff-8fff-ffffffffffff";
export const OBSERVATION_A = "12121212-1212-4121-8121-121212121212";
export const COMPLIANCE_ITEM_A = "23232323-2323-4232-8232-323232323232";
export const LOAN_ACCOUNT_A = "31313131-3131-4131-8131-313131313131";
export const QUESTION_A = "41414141-4141-4141-8141-414141414141";

/** A session in the shape getRequiredSession returns. */
export function fakeSession(
  overrides: { userId?: string; tenantId?: string; roles?: Role[] } = {},
) {
  return {
    user: {
      id: overrides.userId ?? USER_A,
      name: "Test User",
      email: "test@example.com",
      tenantId: overrides.tenantId ?? TENANT_A,
      roles: overrides.roles ?? (["BRANCH_HEAD"] as Role[]),
    },
    session: { id: SESSION_ID },
  };
}

/**
 * A Prisma stand-in whose $transaction hands back the same model map, so code
 * written against `tx.model.method()` exercises the same doubles as
 * `db.model.method()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fakeDb(models: Record<string, unknown>): any {
  const db: Record<string, unknown> = { ...models };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
  return db;
}
