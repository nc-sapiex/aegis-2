import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  setSessionContext,
  type Actor,
  type AuditedAction,
  type SensitiveAction,
} from "@/lib/session-context";

/**
 * The only transaction permitted to mutate an audited table.
 *
 * Opens a transaction, writes the session context the audit trigger reads, and
 * hands the caller a `tx`. Callers never touch the setting names, their
 * ordering, or the requirement that they precede the mutation.
 *
 * A justification is required by the compiler for the four DE6 actions and
 * optional elsewhere:
 *
 *   withAuditedMutation(actor, "notification.queued", (tx) => ...)
 *   withAuditedMutation(actor, "finding.closed", (tx) => ..., "Remediated")
 *
 * One transaction carries one tenant, because the context holds one
 * `app.current_tenant_id`. Work spanning tenants must group by tenant and call
 * this once per group.
 */
type JustificationArgs<A extends string> = A extends SensitiveAction
  ? [justification: string]
  : [justification?: string];

export async function withAuditedMutation<A extends AuditedAction, T>(
  actor: Actor,
  actionType: A,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ...rest: JustificationArgs<A>
): Promise<T> {
  const [justification] = rest as [string?];

  return prisma.$transaction(async (tx) => {
    await setSessionContext(tx, { actor, actionType, justification });
    return fn(tx);
  });
}

/** Actor for a signed-in user, from the session. */
export function userActor(session: {
  user: { id: string; tenantId: string };
  session?: { id: string };
}): Actor {
  return {
    kind: "user",
    userId: session.user.id,
    tenantId: session.user.tenantId,
    sessionId: session.session?.id,
  };
}

/** Actor for scheduled work: the platform acting under policy, no person. */
export function systemActor(tenantId: string): Actor {
  return { kind: "system", tenantId };
}
