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
2026-09-16T11:01:43Z install-drill PASSED vm=aegis-install-drill-1789553600
2026-09-16T15:13Z install-drill FAILED vm=aegis-install-drill-1789571625 reason="docker image export hit a transient containerd/buildkit error ('mount callback failed ... lease does not exist: not found') building the app image; environmental, not code — a bare 'docker compose build app' retry on the same VM succeeded immediately. This run also exercised two real fixes to the script itself: (1) mapping DRILL_HOST in /etc/hosts no longer needs a terminal-bound sudo prompt, which this harness cannot satisfy ('sudo: a password is required') — install-drill.sh now uses 'osascript ... with administrator privileges' for macOS's native auth dialog instead; (2) that mapping is now remove-then-add in one privileged call, not append-only, because cleanup()'s own removal needs a _second_, later admin prompt with no one to answer it unattended — confirmed here: this run's mapping outlived its VM after cleanup's removal silently no-op'd."
2026-09-16T18:5xZ install-drill hand-continued (NOT an automated PASS — do not read as a script-level result) vm=aegis-install-drill-1789571625: after the build failure above, continued the same kept VM by hand through install-drill.sh's remaining steps in order (build retry, migrate, full seed sequence, app up --wait, smoke suite) to validate the sudo-free fix and Task 8 end-to-end, since the VM/image/DB state was otherwise intact and re-launching from scratch would only re-roll the same transient flake. All 50 e2e specs passed against BASE_URL=http://aegis-install-drill.local:3000 (EXIT_CODE=0 confirmed explicitly, not read off a piped wrapper). One more real, non-code finding along the way: Better Auth's /sign-in/email rate limit (10 attempts/15min/IP, Phase 11 SC-1) was exhausted by cumulative manual debugging requests (curl tests plus an earlier partial run) inside the 15-minute window, surfacing as 4/7 auth setups failing with a generic "Login failed" message with valid credentials — restarting the app container cleared the in-memory limiter state and the next clean run passed outright. See the following entry for the real automated confirmation this format requires.
2026-09-16T19:50:32Z install-drill PASSED vm=aegis-install-drill-1789587469
