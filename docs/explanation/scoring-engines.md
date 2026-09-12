# The scoring and escalation engines

AEGIS runs five independent numeric engines that turn examiner input into risk
categories, audit frequencies, compliance scores, and escalation levels. Each
is a pure-function module in `src/lib/` with no database or I/O dependency —
the "Domain logic: pure engines" section of
[`docs/architecture.md`](../architecture.md#domain-logic-pure-engines) names
them; this document works through what each one actually computes, the
boundary cases, and why the formulas look the way they do.

All five conform to specific numbered sections of RBIA Policy 2020, cited in
each module's header comment. Read the module before changing a threshold —
the numbers are regulatory, not tunable defaults.

## The problem

A risk-based audit platform has to turn subjective inputs — an examiner's
1-5 rating on 19 risk parameters, a compliance-scoring checklist, a stack of
overdue findings — into decisions that are the same for every examiner and
every branch: which branches get audited every 12 months instead of 24,
which findings need board reporting, which compliance items just missed their
window. If the arithmetic lived inline in a server action, two actions
touching the same table could silently diverge. Every one of these
computations is centralized in one pure function, called from exactly the
server actions and jobs that need it, and covered by a unit test beside it.

## RAM: branch risk scoring (`src/lib/ram-engine.ts`)

RAM (Risk Assessment Model) turns 19 weighted parameter scores into a branch's
audit frequency for the coming cycle.

```
composite = Σ(score_i × weight_i) / Σ(weight_i)
```

The division by total weight (not by 19) means a branch missing some
parameters — inactive ones, say — still gets a fair composite instead of one
silently dragged toward zero. `computeCompositeScore` throws on an empty
input or on total weight of zero rather than returning `NaN`; a scoring bug
upstream fails loudly here instead of silently producing a wrong risk
category three functions later.

The composite (1-5, higher is riskier) maps to a category and then to an
audit frequency, both via configurable thresholds (defaults: `>3.5` HIGH →
12 months, `>=2.5` MEDIUM → 18 months, else LOW → 24 months). Thresholds are
per-tenant overridable, but the boundary comparisons are asymmetric on
purpose — `>` for HIGH, `>=` for MEDIUM — so a composite of exactly `2.5`
lands in MEDIUM, not LOW.

**Repeat-finding uplift.** If `detectRepeatFindingsForBranch`
(`src/lib/repeat-finding-detector.ts`) finds the branch has open findings that
repeat a prior closed one — either explicitly linked (`Observation.repeatOfId`)
or matched by Postgres `pg_trgm` title similarity `> 0.5` — the raw composite
is multiplied by 1.5× before the risk category is derived, capped at 5.0. The
risk category and audit frequency are always derived from the **adjusted**
score, not the raw one: `computeRamWithUplift` returns both so the UI can show
"raised from 2.9 to 4.35 because of 2 repeat findings," but only the adjusted
figure drives scheduling.

## RBIA scoring: examination tree roll-up (`src/lib/rbia-scoring-engine.ts`)

RBIA examinations score a hierarchical tree of `ExaminationNode`s (variable
depth, 0-5) on a 4-point scale — `FULLY_COMPLIANT` (1.0) down to
`NON_COMPLIANT` (0.0), with `LARGELY_COMPLIANT` (0.75) and
`PARTIALLY_COMPLIANT` (0.5) between. `computeNodeScore` recurses bottom-up:
a leaf returns its own value or `null` if unscored; a parent takes the
weighted average of its **scored** children only — an unscored child (N/A) is
excluded from both the numerator and the denominator, not treated as zero.

**The critical-item cap is a ceiling, not a floor.** If any leaf under a
module is flagged `isCritical` and scored `NON_COMPLIANT`, the whole module's
score is capped at 0.5 — but only if the raw roll-up would otherwise be
*higher* than 0.5. A module that's already scoring 0.3 stays at 0.3; the cap
exists to stop one severe finding from being diluted into a good-looking
average by dozens of compliant leaves, not to punish an already-bad module
twice. `computeModuleScore` applies the cap once, at module level — the
recursive `computeNodeScore` never applies it internally, so nested modules
don't compound the cap.

The composite across modules (`computeCompositeScore`) is another weighted
average excluding `null` (unscored) modules from the denominator — same
pattern as the branch-level roll-up, applied one level higher. The final
rating band (`getRatingBand`) uses **strict `>`** at every threshold: exactly
`0.80` is GOOD, not VERY_GOOD; exactly `0.65` is SATISFACTORY. `toPercentage`
uses `Math.round`, not `Math.floor`, specifically so that 14 equally-weighted
`FULLY_COMPLIANT` leaves round to 100%, not 99% — a floor there would make a
perfect score look imperfect.

## Sampling: deterministic bucket-fill (`src/lib/sampling-engine.ts`)

Loan sampling picks `sampleSizePct`% of a branch's portfolio, split across up
to five criteria buckets (`NEWLY_SANCTIONED`, `AMOUNT_WISE`, `AGE_WISE`,
`DPD_WISE`, `PRIOR_OBSERVATIONS`) whose percentages the HIA configures per
tenant. The algorithm is **deterministic, not random** — for a fixed portfolio
snapshot and config, the same accounts are always selected, because sampling
that couldn't be reproduced on appeal would be useless for a regulated audit.

Each bucket has its own sort order over the *whole* portfolio (e.g.
`DPD_WISE` sorts by days-past-due descending, tie-broken by outstanding
amount then sanction date then account id for total stability), and buckets
are filled largest-percentage-first so the biggest allocation gets first pick
of accounts that would otherwise be claimed by a smaller bucket. An account
already claimed by an earlier bucket cannot be claimed again — the pool for
each bucket is filtered against everything already selected.

**Redistribution, not failure, on a thin bucket.** If `PRIOR_OBSERVATIONS`
only has 3 eligible accounts but was allocated 8, the shortfall of 5 is
redistributed to the buckets processed after it (in the same largest-first
order), and a `RedistributionWarning` records what was requested, what was
filled, and where the difference went — surfaced to the HIA rather than
silently under-sampling. `calculateBucketCounts` also has to correct its own
rounding: five buckets each rounded independently with `Math.round` can sum to
one more than the target sample size, so the largest bucket absorbs the
one-off difference rather than the total silently overshooting.

## Escalation: two engines, one deliberately kept separate

`escalation-engine.ts` computes *when* a compliance item escalates;
`escalation-router.ts` computes *who gets told and what the message says*.
They're split because the first is a pure days-overdue calculation that the
daily job runs against every open item, while the second is presentation
logic (subject lines, message templates) that only runs for items whose level
just changed — merging them would mean re-deriving a notification template
every day for an item sitting quietly at L0.

Levels are set per RBIA policy: L1 at +15 days overdue, L2 at +30, L3 at +90,
L4 at +180 — but "days overdue" is computed **signed**, then clamped to zero
(`Math.max(0, daysBetween(dueDate, now))`), never with `Math.abs`. The module
comment is explicit about why: a due date 30 days in the future is not the
same as one 30 days in the past, and `Math.abs` would collapse that
distinction and promote a brand-new compliance item straight to L2 on the day
it's created. `shouldNotify` fires only when the level *increases* — the
batch job runs daily, but a level that hasn't changed since yesterday doesn't
re-notify.

## Where these engines are not the last word

- The RAM composite in `computeRam` is a **snapshot** function — recomputing
  an assessment from stored parameter scores. The uplift-aware
  `computeRamWithUplift` is the one actually called when a new assessment is
  created; do not call the plain `computeRam` from new code that has repeat
  findings to consider.
- None of these five modules touches the database directly except
  `detectRepeatFindingsForBranch`, which is intentionally the one exception —
  it needs `pg_trgm` similarity, which only Postgres can compute.
- Every write derived from these engines still goes through
  `withAuditedMutation` — see
  [`src/data-access/README.md`](../../src/data-access/README.md) — the
  engines compute the number, the DAL/action layer is what makes the write
  attributable.
