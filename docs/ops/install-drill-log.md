# Install drill log

Record of `scripts/drills/install-drill.sh` runs (spec §10). One line per
run, appended by the script itself on a passing run — never hand-edited to
claim a pass, and never backfilled after the fact.

**Status: no drill has been run yet.** `scripts/drills/install-drill.sh` has
been written and reviewed but not executed — Multipass isn't installed on
the machine that wrote it, and the plan
(`docs/superpowers/plans/2026-09-13-e2e-deployment-drills.md`, Task 5)
requires the user's explicit sign-off on drill-license signing before the
first real run. Do not add a result line below until a run has actually
happened.

## Format

```
<UTC timestamp> install-drill PASSED vm=<multipass VM name>
```

One line per successful run, oldest first, appended automatically by
`install-drill.sh` on success (the script runs under `set -euo pipefail`,
so it exits before reaching this line on any failure — it never writes a
FAILED line itself). A failed run should still be recorded, by hand, in the
same format with PASSED replaced by FAILED plus a one-line reason — the
point of this log is an honest record of what was actually run, not a
clean streak.

## Runs

<!-- append below this line; do not fabricate an entry -->
