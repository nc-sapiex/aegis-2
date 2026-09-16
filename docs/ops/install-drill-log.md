# Install drill log

Record of `scripts/drills/install-drill.sh` runs (spec §10). One line per
run, appended by the script itself on a passing run — never hand-edited to
claim a pass, and never backfilled after the fact.

**Status: one real run, and it failed.** See the entry below. `aegis-app`
never passed its healthcheck and the run's own trap tore the VM down
(as designed) before anyone could see why — that gap is fixed for the next
run (`cleanup()` now dumps `docker compose ps`/`logs` to
`drills/diagnostics/<vm-name>.log` before teardown on any failure), but this
run predates that fix, so no container logs exist for it.

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

2026-09-16T07:30:31Z install-drill FAILED vm=aegis-install-drill-1789543831 reason="aegis-app container unhealthy, docker compose up --wait timed out; no diagnostic logs captured before the VM was torn down (fixed in cleanup() for future runs — see scripts/drills/install-drill.sh)"
