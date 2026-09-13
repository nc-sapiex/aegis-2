# Branch Protection

`main` on `nc-sapiex/aegis-2` is **not protected** as of 2026-09-13.

## Suggested required checks

Every job that runs on all non-docs changes:

- `lint`
- `typecheck`
- `unit-test`
- `integration-test`
- `security-audit`
- `docker-build`
- `e2e-smoke / playwright`

Do not require:

- `docs-check` — path-filtered, so a PR that doesn't touch
  its paths never reports it and would wait forever.
- Full E2E — runs nightly from `e2e.yml`, not on PRs.

CI itself skips docs-only PRs (`paths-ignore` in `ci.yml`), so with the checks
above required, a docs-only PR also blocks. Either merge those as an admin or
drop `enforce_admins`.

## Apply

```bash
gh api -X PUT "repos/nc-sapiex/aegis-2/branches/main/protection" \
  --input - <<'PAYLOAD'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "unit-test", "integration-test",
                 "security-audit", "docker-build", "e2e-smoke / playwright"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
PAYLOAD
```

## Verify

```bash
gh api "repos/nc-sapiex/aegis-2/branches/main/protection" \
  --jq '{checks: .required_status_checks.contexts, force_push: .allow_force_pushes.enabled}'
```
