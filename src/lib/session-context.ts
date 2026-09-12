/**
 * Session context — the six PostgreSQL settings the audit trigger reads.
 *
 * `audit_trigger_function()` populates AuditLog from transaction-scoped
 * settings. This module owns that contract: it is the only place that knows
 * the setting names, their ordering, and how an Actor maps onto them.
 *
 * Deliberately free of `server-only`: the seed and any future read-side
 * wrapper must be able to import it from outside a Next.js server runtime.
 *
 * Scope note: the same `app.current_tenant_id` setting is what row-level
 * security policies read (see prisma/migrations/add_rls_policies.sql). If RLS
 * is ever enabled, it consumes this contract rather than replacing it.
 */

/** Minimal shape of a Prisma client or transaction client. */
export interface RawExecutor {
  $executeRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
}

/**
 * Who is answerable for an audited change.
 *
 * A `system` Actor carries no user: scheduled work is recorded as the platform
 * acting under policy, never attributed to a person who did not act.
 */
export type Actor =
  | {
      kind: "user";
      userId: string;
      tenantId: string;
      ipAddress?: string;
      sessionId?: string;
    }
  | {
      kind: "system";
      tenantId: string;
    };

/**
 * Actions that may not be performed without a stated reason (DE6).
 * Enumerated so the compiler can require a justification for exactly these.
 */
export const ACTIONS_REQUIRING_JUSTIFICATION = [
  "finding.closed",
  "user.role_changed",
  "compliance.marked_na",
  "observation.status_changed",
] as const;

export type SensitiveAction = (typeof ACTIONS_REQUIRING_JUSTIFICATION)[number];

/** Business meaning of a change, named `domain.event_past`. */
export type AuditedAction = `${string}.${string}`;

export interface SessionContext {
  actor: Actor;
  actionType: AuditedAction;
  justification?: string;
}

/**
 * Write the session context onto an open transaction.
 *
 * MUST run inside a transaction, before the mutation. The `TRUE` argument to
 * set_config makes each setting transaction-scoped, which is the only form
 * that is safe behind a connection pool.
 */
export async function setSessionContext(
  tx: RawExecutor,
  ctx: SessionContext,
): Promise<void> {
  const { actor } = ctx;

  await tx.$executeRaw`SELECT set_config('app.current_action', ${ctx.actionType}, TRUE)`;
  await tx.$executeRaw`SELECT set_config('app.current_justification', ${ctx.justification ?? ""}, TRUE)`;
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${actor.tenantId}, TRUE)`;

  if (actor.kind === "user") {
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${actor.userId}, TRUE)`;
    await tx.$executeRaw`SELECT set_config('app.current_ip_address', ${actor.ipAddress ?? ""}, TRUE)`;
    await tx.$executeRaw`SELECT set_config('app.current_session_id', ${actor.sessionId ?? ""}, TRUE)`;
  }

  // A system Actor leaves app.current_user_id UNSET on purpose. The trigger
  // casts it with `_user_id::UUID`; an unset setting reads back as NULL and
  // casts to NULL (AuditLog.userId is nullable), whereas an empty string would
  // raise `invalid input syntax for type uuid: ""` and abort the mutation.
}
