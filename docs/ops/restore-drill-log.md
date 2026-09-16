# Restore drill log

Record of `scripts/drills/restore-drill.sh` runs (spec §10). One line per
run, appended by the script itself on a passing run — never hand-edited to
claim a pass, and never backfilled after the fact.

**Status: #170 fixed and confirmed on a real drill VM.** The first run
(2026-09-16, below) failed: `pg_dump --clean` emitted an invalid
`DROP CONSTRAINT` for pg-boss's partitioned `queue_stats` table once a
daily partition existed, which `restore.sh` correctly refused to swallow
(`ON_ERROR_STOP=1 --single-transaction` rolled the whole restore back
cleanly; no partial/corrupt state). Fixed in `scripts/backup.sh`/
`restore.sh` by dropping `--clean` and having `restore.sh` discover and
drop/recreate the target's schemas itself before loading the dump. The
second run (below) confirms it end-to-end on a real Multipass VM: the
source database had `pgboss.queue_stats_20260915` and `_20260916`
partitions attached (the exact condition #170 hit), and both partitions
were present and attached on the VM after restore — verified separately
from the row-count line the script appends, since the local dev
database's `Observation` table happened to be empty at the time
(`rows=0` below is a real equality, not a meaningful data check; the
partition survival is the actual confirmation).

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

2026-09-16T11:35:00Z restore-drill FAILED vm=aegis-install-drill-1789553600 reason="pg_dump --clean DROP CONSTRAINT on pgboss.queue_stats_20260916_pkey rejected by Postgres (inherited partition constraint); restore rolled back cleanly under --single-transaction, no corruption; see #170"
2026-09-16T19:59:06Z restore-drill PASSED vm=aegis-install-drill-1789587469 rows=0
