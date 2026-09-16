# Restore drill log

Record of `scripts/drills/restore-drill.sh` runs (spec §10). One line per
run, appended by the script itself on a passing run — never hand-edited to
claim a pass, and never backfilled after the fact.

**Status: no drill has been run yet.** `scripts/drills/restore-drill.sh` has
been written and statically verified (shellcheck, `bash -n`, and a careful
read against `install-drill.sh --keep`) but not executed — it chains onto
an install-drill VM (`install-drill.sh --keep`), and that VM run is itself
still blocked on the user generating a throwaway drill license (see
`docs/ops/install-drill-log.md`). Do not add a result line below until a
run has actually happened.

`scripts/backup.sh` and `scripts/restore.sh`, which this drill calls, have
themselves been run for real — against a disposable local Postgres +
MinIO stack created and destroyed for that purpose, not against any VM or
shared database — and reproduced the same row counts and object contents
after a restore. See the Task 6 report for detail. That is not the same
thing as this drill, which additionally exercises the Multipass VM hop and
is recorded here.

## Format

```
<UTC timestamp> restore-drill PASSED vm=<multipass VM name> rows=<Observation row count>
```

One line per successful run, oldest first, appended automatically by
`restore-drill.sh` on success (the script runs under `set -euo pipefail`,
so it exits before reaching this line on any failure — it never writes a
FAILED line itself). A failed run should still be recorded, by hand, in the
same format with PASSED replaced by FAILED plus a one-line reason — the
point of this log is an honest record of what was actually run, not a
clean streak.

## Runs

<!-- append below this line; do not fabricate an entry -->
