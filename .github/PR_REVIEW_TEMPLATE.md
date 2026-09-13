## PR Review Checklist

### Correctness & Logic
- [ ] Logic is sound and meets stated requirements.
- [ ] Boundary conditions and edge cases are properly handled.
- [ ] Tenant isolation rules are strictly preserved (`where: { tenantId }` / `getRequiredSession()`).
- [ ] No regressions introduced to existing behavior.

### Security & Compliance
- [ ] No hardcoded secrets, credentials, or sensitive data.
- [ ] Input validation and sanitization are in place.
- [ ] Permissions and guards (`hasPermission` / `requirePermission`) are correctly applied.
- [ ] Audited mutations use `withAuditedMutation()` where required.

### Performance & Resource Usage
- [ ] Database queries are efficient, indexed, and bounded (no N+1 queries).
- [ ] Code avoids unnecessary re-renders, memory leaks, or heavy compute on the main thread.

### Readability & Style
- [ ] Code style and naming conventions conform to project standards.
- [ ] Code is clear and self-documenting; comments explain *why*, not *what*.
- [ ] Imports use `@/*` path aliases.

### Testing & Quality
- [ ] Adequate test coverage provided for new or modified functionality.
- [ ] Unit/integration tests pass reliably without flakiness.

---

## Review Outcomes (Copy & Paste)

### Option 1: Approved
```markdown
### 🟢 Review Outcome: Approved

- [x] Code correctness and requirements verified.
- [x] Security, performance, and tenant isolation confirmed.
- [x] Test coverage is adequate and passing.

**Comments / Notes:**
Ready to merge once CI passes.
```

### Option 2: Request Changes
```markdown
### 🔴 Review Outcome: Request Changes

The PR looks good overall, but the following items need to be addressed before approval:

1. **[Area]**: [Description of issue or required change]
2. **[Area]**: [Description of issue or required change]

Please re-request review once these updates are pushed.
```

### Option 3: Comment-Only
```markdown
### 💬 Review Outcome: Comment / Questions

Left non-blocking comments and questions inline. No structural changes strictly required for approval.
```
