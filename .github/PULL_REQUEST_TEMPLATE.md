## Summary
<!-- Concise summary of the changes introduced by this PR -->

## Review & Merge Guidance
- [ ] Reviewers should use [PR_REVIEW_TEMPLATE.md](/.github/PR_REVIEW_TEMPLATE.md) for correctness, security, performance, readability, tests, and edge-case checks.
- [ ] Before merging, confirm [PR_APPROVAL_AND_MERGE_TEMPLATE.md](/.github/PR_APPROVAL_AND_MERGE_TEMPLATE.md) is satisfied.

## Motivation & Context
<!-- Why is this change required? What problem does it solve? Link any related issue(s) -->

## Type of Change
- [ ] Bug fix (non-breaking change fixing an issue)
- [ ] New feature (non-breaking change adding functionality)
- [ ] Refactoring / Tech Debt (code improvement without functional changes)
- [ ] Documentation (updates to docs or comments)
- [ ] Security / Maintenance (dependency updates, security patches)
- [ ] Breaking change (fix or feature causing existing functionality to change)

## Validation & Testing
- [ ] Unit tests added/updated (`pnpm test:unit`)
- [ ] Integration tests added/updated (`pnpm test:integration`)
- [ ] E2E tests added/updated (`pnpm test:e2e:smoke` or full suite)
- [ ] Manual testing performed (describe steps below)

<!-- Describe manual testing performed or reasons why tests were not added -->

## Screenshots / UI Notes
<!-- Attach screenshots, GIFs, or UI notes if applicable; write N/A if not UI-related -->

## Impact Assessment
- **Security:** <!-- Any security, authentication, or permission changes? -->
- **Data / Schema:** <!-- Database schema changes, migrations, or data integrity impacts? -->
- **Operations:** <!-- Infrastructure, environment variables, background jobs, or deployment impact? -->

## Rollback Plan
<!-- How to safely revert this change if issues arise after merge -->

## Pre-Submission Checklist
- [ ] I have performed a self-review of my own code.
- [ ] Code follows project style guidelines (`pnpm lint` and formatting).
- [ ] I have updated related documentation if applicable.
- [ ] No secrets, private credentials, or debug artifacts are included.
- [ ] Required local checks pass; advisory checks are reviewed separately.
