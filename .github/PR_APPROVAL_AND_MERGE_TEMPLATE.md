## PR Approval & Merge Gate Checklist

### Mandatory Pre-Merge Gates
- [ ] **CI Pipeline:** All automated CI checks (`lint`, `typecheck`, `test:unit`, etc.) are passing.
- [ ] **Unresolved Conversations:** All review comments and code discussions have been resolved or addressed.
- [ ] **Documentation:** Documentation (`docs/reference/`, README, or inline docs) is updated if required (`pnpm docs:check`).
- [ ] **Author Self-Review Attestation:** Author has completed a thorough self-review of changes (required for all PRs, including solo-developer work).
- [ ] **Reviewer Approval:** Approved by at least one peer reviewer (or self-approved with documented attestation for solo-developer workflows).

### Merge Method Selection
- [ ] **Squash and Merge:** (Recommended for feature branches to keep `main` history clean).
- [ ] **Rebase and Merge:** (Use when individual commits are clean, logical, and atomic).
- [ ] **Merge Commit:** (Use only when preserving explicit branch topology is required).

### Post-Merge Checklist
- [ ] Confirm post-merge CI / validation completes cleanly.
- [ ] Delete feature branch after successful merge.
- [ ] Verify local worktree is updated (`git pull origin main`).
