# Onboarding and invitations

Two related but separate flows provision a new tenant: the **onboarding
wizard** (a `SYSTEM_ADMIN`/`CAE` sets up the bank once) and **user
invitations** (that admin then brings colleagues in one at a time,
repeatable indefinitely after onboarding is done). Neither is covered in
[`docs/architecture.md`](../architecture.md) beyond a passing mention;
this document works through both end to end.

## Onboarding: a five-step wizard, one atomic commit

`src/lib/onboarding-validation.ts` defines five independent Zod schemas, one
per wizard step, validated client-side per step via React Hook Form's
`zodResolver` before the user can advance:

1. **Bank registration** — name, RBI license (`UCB-XX-YYYY-NNNN`), PAN, CIN,
   scheduled/non-scheduled status. A `.refine()` makes `scheduledDate`
   conditionally required only when `ucbType === "SCHEDULED"` — the schema
   itself encodes a business rule that a flat field-by-field validator
   couldn't express.
2. **Tier selection** — UCB tier (1-4), PCA status, deposit amount.
3. **RBI Master Direction selection** — which regulatory checklist items
   apply. Marking an item "not applicable" requires a justification of at
   least 20 characters — long enough to force an actual reason, not a
   placeholder.
4. **Organization structure** — departments and branches, each requiring a
   unique code and a unique head/manager email; a top-level `.refine()`
   checks uniqueness *across* both departments and branches together, not
   just within each list, because both feed the same `headEmail`/
   `managerEmail` pool.
5. **User invitations** — optional (`userInvites` can be empty; "I'll invite
   users later" is a legitimate skip), each invite scoped to five roles
   (`CAE`, `CCO`, `AUDIT_MANAGER`, `AUDITOR`, `AUDITEE` — a deliberately
   narrower set than the full 17-role RBAC matrix, since a first-run wizard
   is not where you'd assign `RISK_HEAD` or `ACB_MEMBER`). `AUDITEE` invites
   additionally require at least one branch assignment via a `.refine()`.

**Progress is saved per step** (`saveWizardStep` → `OnboardingProgress`
table) so a partially completed wizard survives a closed tab, but nothing is
provisioned in the tenant's real tables until the final step.
`completeOnboarding` then calls `completeOnboardingTransaction` — one atomic
transaction that creates the bank profile, branches, departments, RBI
compliance checklist rows, and invited users together. If any part fails,
none of it commits; there is no partially-provisioned tenant.

**Both entry points gate on `admin:manage_settings`** (held by `CAE` and
`SYSTEM_ADMIN` — see
[`docs/reference/rbac-matrix.md`](../reference/rbac-matrix.md)), and the
source comment in `onboarding.ts` states why plainly: onboarding overwrites
the bank profile and mints users with caller-supplied roles, so without the
gate any authenticated tenant user could replay it to grant themselves an
admin role. This is worth remembering if onboarding is ever exposed through
a new entry point — the permission check has to travel with it.

## Invitations: mint, mail, accept — three separate trust boundaries

Sending an invitation (`sendUserInvitations` in
`src/actions/user-invitations.ts`) and accepting one (`acceptInvitation`) are
different code paths with different actors, and the implementation keeps
several things deliberately separate that would be tempting to merge:

**Token minting happens before the transaction opens.** `mintInviteToken()`
runs bcrypt at cost 12 — slow by design, since it protects a token an
attacker could try to guess — and the source comment explains why it's
outside `withAuditedMutation`'s transaction: running a slow bcrypt hash while
a database transaction holds a connection open is exactly the kind of cost a
connection-pooled app can't afford to pay under a lock.

**Email sends after the transaction commits, not inside it.** SES is network
I/O; a transient SES outage must not roll back the user records that were
already created. If the email fails to send, the invited user still exists
with a valid token — `resendInvitation` (matching only `status: INVITED`)
recovers from that state without creating a duplicate.

**Acceptance is guarded against a race, not just a check-then-act.** The
activation update is `tx.user.updateMany({ where: { id, status: "INVITED" },
data: { status: "ACTIVE", ... } })` — predicated on the *current* status
inside the same statement, not a separate read-then-write. If
`activated.count !== 1`, the invitation was already consumed (by a second
concurrent submission, or a stale page reload) and the code throws a sentinel
error the caller translates into "This invitation has already been used,"
rather than silently reactivating or double-crediting anything.

**The credential row is upserted, not created, in the same transaction as
activation.** The unique key is `(accountId, providerId)`; on conflict the
password hash is refreshed. Two reasons this matters, both from source
comments: a user left `ACTIVE` with no credential row could neither sign in
nor be re-invited (since `resendInvitation` only matches `INVITED`), and a
double-submitted acceptance form must not create two competing credential
rows for the same person — the upsert makes whichever submission runs last
win, rather than the second one erroring.

**No separate `AuditLog.create` follows activation, and that's deliberate.**
`User` already carries the audit trigger, so the `updateMany` above writes
its own audit row via `withAuditedMutation`'s session context. A manual
audit-log write after that would duplicate the row — and, landing after the
transaction commits, a failure in that manual write would report a
successful activation as a failed one, sending the user back to an
invitation their own success already consumed.

## Two password-hashing call sites — same algorithm, different context

There are two places a credential password gets hashed, and they are not
interchangeable code that happens to be duplicated — they exist because two
different runtime contexts are available at each call site:

- **`src/lib/credential-account.ts`'s `hashedCredentialAccount`**, calling
  `better-auth/crypto`'s `hashPassword` directly. Used by `prisma/seed.ts`
  and `scripts/create-accounts.ts` — offline scripts with no live Next.js
  request and no instantiated Better Auth server context to call into.
- **`acceptInvitation`'s inline `(await auth.$context).password.hash(...)`**.
  Used only inside the live server action, where the full `auth` instance
  already exists.

`src/lib/auth.ts` configures no custom password hasher, so both paths run
Better Auth's same default algorithm — the split exists purely because a
seed script has no `auth.$context` to await, not because the two are
different hashing schemes. The comment at the `acceptInvitation` call site is
explicit that this consistency is load-bearing: "Hash through its context so
the digest matches what `signIn.email` will later verify — a bcrypt digest
never would." If you're adding a third place that creates a credential
`Account` row, use whichever of the two matches your context — do not invent
a third hashing call, and never reach for a generic bcrypt/argon2 call
directly.
