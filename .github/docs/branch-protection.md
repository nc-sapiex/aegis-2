# Branch Protection Configuration

## Main Branch Protection

Configured on: 2026-02-11

### Required Status Checks

- lint
- typecheck
- build
- e2e

### Settings

- **Require branches to be up to date**: Yes (strict: true)
- **Enforce for administrators**: Yes
- **Allow force pushes**: No
- **Allow branch deletion**: No
- **Require pull request reviews**: No (solo developer workflow)
- **Restrict who can push**: No restrictions

### Configuration Method

Branch protection configured via GitHub API:

```bash
gh api -X PUT "repos/naveenchhikara/AEGIS/branches/main/protection" \
  --input - <<'PAYLOAD'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["lint", "typecheck", "build", "e2e"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
PAYLOAD
```

### Verification

```bash
gh api "repos/naveenchhikara/AEGIS/branches/main/protection" \
  --jq '{required_checks: .required_status_checks.contexts, enforce_admins: .enforce_admins.enabled, allow_force_pushes: .allow_force_pushes.enabled}'
```

Expected output:

```json
{
  "allow_force_pushes": false,
  "enforce_admins": true,
  "required_checks": ["lint", "typecheck", "build", "e2e"]
}
```

## Effect

- Direct pushes to main are blocked unless all 4 status checks pass
- Pull requests cannot be merged unless all 4 status checks pass
- Applies to all users including repository administrators
- Force push protection prevents rewriting history on main branch
