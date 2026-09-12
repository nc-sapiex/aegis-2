# AEGIS

Risk-Based Internal Audit for Urban Cooperative Banks under RBI supervision. One
platform covers the audit lifecycle: risk assessment, planning, execution,
findings, compliance follow-up, and board governance — across many banks, each
isolated from the others.

## Language

### Tenancy

**Tenant**:
One bank using the platform. The unit of data isolation: no record is ever
visible across tenants.
_Avoid_: organisation, customer, client, account

### Audit trail

**Actor**:
The party answerable for a change to audited data. Either a **User actor** (a
person, acting in a session) or a **System actor** (the platform itself, acting
on a schedule or policy with no person behind it). Every audited change names
one, and a System actor is recorded as such rather than attributed to a person.
_Avoid_: user (when the actor may be the system), principal, subject

**Audited Action**:
The business meaning of a change, named as `domain.event_past` (for example
`finding.closed`). Distinct from the database operation that carried it out —
one insert may be a creation, an escalation, or a response depending on intent.
_Avoid_: event type, operation, activity

**Justification**:
The reason a person gives for a sensitive Audited Action. Required for closing a
finding, changing a user's roles, marking a compliance item not-applicable, and
moving an observation to a terminal state; optional elsewhere.
_Avoid_: comment, note, reason

### Findings

**Observation**:
A formal audit finding recorded in the 5C structure — Condition, Criteria,
Cause, Effect, Recommendation — that advances through a fixed lifecycle from
draft to closed under maker-checker control.
_Avoid_: issue, finding (when the formal record is meant), defect

**Action Point**:
A lighter finding raised during RBIA examination and answered by the branch
manager, distinct from the formal Observation record.
_Avoid_: task, todo, minor finding
