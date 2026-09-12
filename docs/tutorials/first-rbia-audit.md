# Tutorial: your first RBIA audit, start to finish

This walks one branch through the entire cycle AEGIS is built around: score
its risk, plan an audit against that score, run the RBIA examination, freeze
the score, raise a finding, and watch it flow into the compliance registry.
Every screen and permission named below is real — verified against the route
files and server actions, not a UI guess. If you get a redirect to
`/dashboard` at any step, it means your role lacks the permission named for
that step; see [`docs/reference/rbac-matrix.md`](../reference/rbac-matrix.md)
to find a role that has it.

You'll need a seeded tenant with at least one branch and a user holding
`CAE` or `SYSTEM_ADMIN` (RAM and RBIA setup steps gate on these). If you
haven't onboarded a tenant yet, do that first —
[`docs/explanation/onboarding-and-invitations.md`](../explanation/onboarding-and-invitations.md).

## 1. Score the branch's risk (RAM)

Go to **`/ram`**. This page requires `ram:read`; the "New Assessment" action
requires `ram:create`.

1. Create a new assessment for a branch. It starts in `DRAFT`
   (`src/app/(dashboard)/ram/page.tsx`).
2. Open the assessment (`/ram/[assessmentId]`) and enter scores for each RAM
   parameter in the form. Until you've entered at least one score, only
   "edit" is available — "Compute" appears once `scores.length > 0`.
3. Click **Compute**. This runs the RAM scoring engine
   (`src/lib/ram-engine.ts`) and moves the assessment to `COMPUTED`, showing
   a composite score, risk category, and derived audit frequency — see
   [`docs/explanation/scoring-engines.md`](../explanation/scoring-engines.md#ram-engine-risk-assessment-model)
   for how that math works.
4. A second user holding `ram:approve` clicks **Approve**. The assessment
   moves to `APPROVED`, and the page shows a green "Ready for Audit
   Planning" banner with a direct link to `/audit-plans`.

**Why a separate approver:** RAM scores drive audit frequency and, later, an
auditee's compliance obligations — the same maker-checker discipline covered
in
[`docs/explanation/state-machines-and-maker-checker.md`](../explanation/state-machines-and-maker-checker.md)
applies here even though RAM approval isn't one of that document's two named
state machines.

## 2. Generate the annual audit plan

Go to **`/audit-plans`**. Use **Generate Annual Audit Plan**. It schedules
branch audits from RAM scores and last-audit date: RAM > 3.5 gets a 12-month
cycle, 2.5–3.5 gets 18 months, and < 2.5 gets 24 months (the thresholds are
stated directly on the page,
`src/app/(dashboard)/audit-plans/page.tsx`). This produces one `AuditPlan`
row (a fiscal year + quarter) with `Engagement` rows underneath it, one per
scheduled branch.

You don't have to wait for the generator: the **Surprise Audit Scheduler** on
the same page creates an ad-hoc engagement outside the generated plan, for
the RBI-mandated unannounced-audit requirement.

## 3. Create the engagement

If the plan generator didn't already create the engagement you want, go to
**`/audit-execution/create`**. The form
(`src/components/audit-execution/engagement-form.tsx`) needs a branch, an
audit area, and optionally an audit plan and a RAM assessment to link. Submit
to create the `Engagement` — it starts in `PLANNED`.

## 4. Move the engagement through its lifecycle

Open **`/audit-execution/[engagementId]/rbia`**. The layout at the top of
every tab shows the **engagement stepper** and, next to it, a button for the
single next transition the state machine allows
(`src/lib/engagement-state-machine.ts`, walked through fully in
[`docs/explanation/state-machines-and-maker-checker.md`](../explanation/state-machines-and-maker-checker.md#engagement-lifecycle-engagement-state-machinets)):

```
PLANNED → TEAM_ASSIGNED → OPENING_MEETING → IN_PROGRESS → EXIT_MEETING → REPORT_DRAFT → COMPLETED
```

Two of these transitions are gated on something you have to do first, not
just click:

- **`PLANNED → TEAM_ASSIGNED`** needs at least one team member assigned
  (audit_execution:manage_team permission holders assign the team on this
  same page).
- **`OPENING_MEETING → IN_PROGRESS`** needs an opening meeting recorded on
  the **Meetings** tab first — the transition button stays disabled with a
  tooltip ("Record opening meeting first") until you do.
- Symmetrically, **`EXIT_MEETING → REPORT_DRAFT`** needs an exit meeting
  recorded.

Do the opening meeting now, then advance to `IN_PROGRESS` — this is the
status the examination tabs below expect.

## 5. Run the RBIA examination

Still on `/audit-execution/[engagementId]/rbia`, the tab bar gives you the
whole examination surface:

- **Examination** (the default tab) — the composite score panel plus a grid
  of module cards. Module management (adding/removing modules from this
  engagement) is only allowed while the engagement is in `PLANNED`,
  `TEAM_ASSIGNED`, `OPENING_MEETING`, or `IN_PROGRESS`, and only if the
  branch score isn't already frozen.
- **Loan Portfolio** — bulk-import the branch's loan book here first if this
  module needs it; see
  [`docs/how-to/excel-import-export.md`](../how-to/excel-import-export.md).
- **Sampling** — runs the deterministic bucket-fill sampling algorithm
  (`src/lib/sampling-engine.ts`) against the imported loan portfolio to pick
  which accounts get examined —
  [`docs/explanation/scoring-engines.md`](../explanation/scoring-engines.md#sampling-engine)
  covers the algorithm.
- **Account Exam** — click into a module card from the Examination tab to
  reach its examination tree (`.../rbia/module/[moduleCode]`) and score
  individual checklist items; the hierarchical scoring with its critical-item
  cap is also covered in the scoring-engines doc.
- **Findings** — raise an observation directly against this engagement (same
  form as step 6 below, pre-scoped to this branch/engagement).
- **Meetings** — record the opening and exit meetings the stepper needs.
- **Score** — the composite score panel again, with the **freeze** control.

Work through enough modules and sampled accounts to get a composite score,
then move to step 6 before freezing — freezing is a one-way door.

## 6. Raise a finding (observation)

Go to **`/findings/new`** (requires `observation:create` — held by
`AUDITOR`, `LEAD_AUDITOR`, `FIELD_AUDITOR`, `CONCURRENT_AUDITOR`, and
`IS_AUDITOR`). The form
(`src/components/findings/observation-form.tsx`) records the observation in
**5C format** (Condition, Criteria, Cause, Consequence, Corrective action —
the standard internal-audit finding structure), scoped to a branch and audit
area.

Submitting creates the observation in `DRAFT`. From here it moves through the
observation lifecycle
(`src/lib/state-machine.ts`, full detail in
[`docs/explanation/state-machines-and-maker-checker.md`](../explanation/state-machines-and-maker-checker.md#observation-lifecycle-state-machinets)):

```
DRAFT → SUBMITTED → REVIEWED → ISSUED → RESPONSE → COMPLIANCE → CLOSED
```

Open the observation at `/findings/[id]` and use the actions available there
for your role: **Submit for Review** (any author), **Approve** (an
`AUDIT_MANAGER` who isn't the author), **Issue to Auditee**, then — once
issued — the auditee's own **Respond**, and finally **Mark Compliance** /
**Close**. The maker-checker rule that blocks an author from approving their
own draft is enforced here, not just documented — see the state-machine doc
for the exact distinctness rule at each stage.

## 7. Freeze the branch RBIA score

Back on the engagement's **Score** tab, once you're satisfied with the
module scores, the composite is stable, and the loan-sample examinations
are done, a user holding `rbia:score_freeze` clicks **Freeze**. This writes
`BranchRbiaScore.frozenAt` and is enforced as a one-way door at the database
level, not just in the UI — no action in the app can un-freeze it once set.
Freezing is also the prerequisite the engagement state machine checks before
`REPORT_DRAFT → COMPLETED` can happen, so do this before your exit meeting if
you want to close the engagement out.

## 8. Watch the finding become a compliance obligation

The **`ISSUED`** transition on your observation (step 6) does something you
won't see happen: `src/actions/observations/transition.ts` auto-creates a
`ComplianceItem` row with a 30-day due date the moment an observation is
issued. You don't create this yourself — it's a side effect, not a separate
form.

Go to **`/compliance`** (`compliance:read`) and find it in the registry. It
starts `BRANCH_RESPONSE_DUE` (counted as "Open" in the summary cards on that
page). From here:

1. A user holding `compliance:branch_response` submits the branch's response
   — status moves to `BRANCH_RESPONSE_SUBMITTED` ("Pending Review").
2. A user holding `compliance:zac_review` reviews it — `ZAC_REVIEW`, then
   `ZAC_APPROVED` or back to the branch if rejected.
3. Once approved, the item is `CLOSED`.

If a compliance item sits in `BRANCH_RESPONSE_DUE` past its due date, the
escalation engine (not the observation state machine) takes over — L0
through L4, notifying progressively senior roles — see
[`docs/explanation/scoring-engines.md`](../explanation/scoring-engines.md#compliance-escalation-engine-vs-escalation-router)
for exactly how that's triggered and who gets notified.

## What you just did

Branch risk (RAM) → scheduled audit (Audit Plan) → RBIA examination with
sampled accounts and hierarchical scoring → a finding, written in 5C format
→ that finding's own state machine → an auto-created compliance obligation
→ the branch's response → ZAC sign-off. This is the full loop every other
document in `docs/` describes a piece of — start there for depth on any one
stage:
[`docs/architecture.md`](../architecture.md),
[`docs/explanation/scoring-engines.md`](../explanation/scoring-engines.md),
[`docs/explanation/state-machines-and-maker-checker.md`](../explanation/state-machines-and-maker-checker.md),
[`docs/reference/rbac-matrix.md`](../reference/rbac-matrix.md).
