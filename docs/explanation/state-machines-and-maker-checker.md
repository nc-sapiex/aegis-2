# State machines and maker-checker

AEGIS enforces two independent lifecycles as pure, typed state machines —
`src/lib/state-machine.ts` (observations) and
`src/lib/engagement-state-machine.ts` (engagements) — plus a separate
maker-checker layer (`src/lib/maker-checker.ts`) that neither machine knows
about. `docs/architecture.md`'s
["State machines" section](../architecture.md#state-machines) names all
three; this document works through *why* they're split the way they are and
the specific transition rules each one enforces.

## The problem

Two different rules govern "can this person do this action right now," and
conflating them produces either an overpermissive system or an unfixable one:

1. **Role-based**: does this user's role permit this kind of transition at
   all? (Only `AUDIT_MANAGER` can approve a submitted observation.)
2. **Instance-based**: regardless of role, has *this specific person* already
   acted on *this specific record* in a way that disqualifies them from
   acting again? (An `AUDIT_MANAGER` who wrote the observation cannot also
   approve it.)

A role check alone would let a lone `AUDIT_MANAGER` write and approve their
own finding — exactly the self-review a maker-checker control exists to
prevent. An instance check alone has no way to say who is even eligible to
try. AEGIS keeps them as two separate functions with two separate call sites,
composed by the server action, rather than one god-function — see how
`canTransition` (role/severity) and `checkObservationTransition`
(maker-checker) are both called from the same action but never call each
other.

## Observation lifecycle (`state-machine.ts`)

Seven states, eight transitions (six forward, two return-to-earlier):

```
DRAFT ──Submit for Review──▶ SUBMITTED ──Approve──▶ REVIEWED ──Issue to Auditee──▶ ISSUED
                                 │  ▲                   │  ▲
                    Return to Draft  └─Return for Re-review┘
                                                            │
                                                       Respond
                                                            ▼
                              CLOSED ◀──Mark Compliance── RESPONSE
                                 ▲                            │
                                 └──────Close Observation──── COMPLIANCE
```

- **`DRAFT → SUBMITTED`** is open to every role that holds
  `observation:create` (`OBSERVATION_AUTHOR_ROLES`: `AUDITOR`,
  `LEAD_AUDITOR`, `FIELD_AUDITOR`, `CONCURRENT_AUDITOR`, `IS_AUDITOR`) — not
  just `AUDITOR`. The module comment is explicit about why: every author has
  to be able to submit their own draft, or a role that can create but not
  submit strands its drafts forever, with the UI telling the user to submit
  while showing no button to do it. A dedicated test,
  `observation-author-roles.test.ts`, fails the build if a role gains
  `observation:create` in `permissions.ts` without also appearing here.
- **`COMPLIANCE → CLOSED`** is the one transition with a `severityGuard`:
  `LOW`/`MEDIUM` severity can be closed by `AUDIT_MANAGER` or `CAE`;
  `HIGH`/`CRITICAL` requires `CAE` specifically. The guard runs only after
  the role check passes, and refuses outright if severity is missing —
  closing is never silently permitted on absent data.
- **Severity escalation on repeat occurrence** (`escalateSeverity`) is a
  separate, unrelated rule living in the same file: 1st occurrence, no
  change; 2nd occurrence, +1 level (`LOW→MEDIUM→HIGH→CRITICAL`); 3rd or more,
  always `CRITICAL` regardless of where it started. `CRITICAL` has no level
  above it, so further occurrences are a no-op, not an error.

## Engagement lifecycle (`engagement-state-machine.ts`)

Eight states, modeled as `Record<EngagementStatus, TransitionDef[]>` rather
than a flat list — TypeScript's exhaustiveness checking means adding a ninth
`EngagementStatus` to the Prisma enum without adding its entry here is a
compile error, not a runtime gap:

```
PLANNED → TEAM_ASSIGNED → OPENING_MEETING → IN_PROGRESS → EXIT_MEETING → REPORT_DRAFT → COMPLETED
   │            │               │                              │              │
   └────────────┴───────────────┴────────── CANCELLED ◀─────────┴──────────────┘
```

Every non-terminal state can transition to `CANCELLED`; `COMPLETED` and
`CANCELLED` are terminal (empty transition arrays).

Four of the five forward transitions carry a **prerequisite** beyond the role
check — a fact about the engagement's real-world state, not about who's
asking:

| Transition | Prerequisite | Why |
| --- | --- | --- |
| `PLANNED → TEAM_ASSIGNED` | `teamMemberCount > 0` | Fieldwork cannot start with nobody assigned |
| `OPENING_MEETING → IN_PROGRESS` | `hasOpeningMeeting` | RBIA practice requires the meeting recorded and signed off before fieldwork begins |
| `EXIT_MEETING → REPORT_DRAFT` | `hasExitMeeting` | Same discipline, at the other end of fieldwork |
| `REPORT_DRAFT → COMPLETED` | `hasFrozenScore` | The branch's RBIA score must be frozen (see below) before the engagement can close |

These are evaluated in `canTransitionEngagement` only *after* the role check
passes — a user without the right role gets the role-refusal message even if
the prerequisite would also fail, so the reason shown always names the
binding constraint. `TEAM_ASSIGNED → OPENING_MEETING`, by contrast, is
role-gated only (`CAE`, `AUDIT_MANAGER`, `LEAD_AUDITOR`) with no prerequisite
function — recording a meeting has no precondition beyond having a team.

**Score freeze is a one-way door.** `hasFrozenScore` reads
`BranchRbiaScore.frozenAt`, and the freeze itself is protected at the
database level, not just in this state machine — see `docs/architecture.md`'s
description of the DB-level trigger that blocks un-freezing a frozen score.
The engagement machine's prerequisite is the *application-level* half of that
guarantee: it stops a report draft from completing without a frozen score,
while the database stops the frozen score from being un-frozen underneath a
completed engagement.

## Maker-checker: a third, independent layer

`maker-checker.ts` never imports either state machine and neither state
machine imports it — they compose at the call site (the server action),
not through a shared abstraction. Its one primitive,
`requireDistinctActor(actorId, priorActs)`, refuses when the current actor
appears in a list of people who already acted on the record; a `null` userId
in that list means "nobody has reached this stage yet" and blocks nothing.

Two call sites, two different distinctness rules — not the same rule reused
twice:

- **`checkObservationTransition`** requires the checker to differ from the
  *maker* (`createdById`) only at three specific edges: `SUBMITTED→REVIEWED`,
  `REVIEWED→ISSUED`, `COMPLIANCE→CLOSED`. It deliberately does **not**
  require the reviewer (`SUBMITTED→REVIEWED`, always `AUDIT_MANAGER` per the
  state machine) to differ from the issuer (`REVIEWED→ISSUED`, also always
  `AUDIT_MANAGER`) — the same manager reviewing and then issuing their own
  review is allowed, because the design already makes both stages the same
  role; only the original author is excluded. `RESPONSE→COMPLIANCE` has no
  checker requirement at all — marking compliance is recording a fact about
  what the auditee did, not approving anyone's work.
- **`checkReportTransition`** requires the issuer to differ from the
  *reviewer* (`reportReviewedById`), not from the approver. The comment in
  the source is explicit about why the asymmetry is intentional: only `CAE`
  can issue a report, so if issuer also had to differ from *approver* (also
  frequently `CAE`), a bank with a single CAE could never issue a single
  report — the control would make the workflow impossible to complete, not
  just harder.

**The pattern to copy for a new maker-checker check:** decide the minimum
distinctness the domain actually requires — not "every stage must differ
from every other stage" by default — and only exclude the roles/stages where
requiring distinctness would make the workflow unusable for a bank with thin
staffing. `requireDistinctActor` supports any number of prior acts in its
list; both current call sites only ever pass one.
