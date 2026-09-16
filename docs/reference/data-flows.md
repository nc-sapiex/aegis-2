# Data Flows

> **Generated file — do not edit by hand.**
> Produced by `scripts/generate-reference-docs.mjs` from `prisma/schema.prisma`
> and the `src/` tree. Regenerate with `pnpm docs:reference`.
>
> Source commit: `ca28305` (cursor/ci-autofix-automation-5587)

Which processes read and write which tables.

Derived by static analysis: each module is scanned for `prisma.<model>`,
`tx.<model>` and `db.<model>` accesses. This captures direct database access.
A module reaching a table indirectly — through a helper in `src/data-access/` —
is **not** shown here, so treat this as a map of direct access, not a complete
reachability graph.

## Process → table map

| Domain | Modules | Tables touched directly |
|---|---|---|
| `(root)` | 8 | `Account`, `AuditeeResponse`, `Evidence`, `Observation`, `ObservationTimeline`, `Tenant`, `User` |
| `account-examination` | 1 | `AccountExamResponse`, `AuditEngagement`, `ExaminationQuestion`, `PopulationRecord` |
| `admin` | 5 | `AuditCalendar`, `Branch`, `ReportTemplate`, `Zone` |
| `audit-execution` | 6 | `AuditEngagement`, `AuditModule`, `AuditTeamMember`, `Branch`, `CashCheck`, `EngagementModule` |
| `audit-plans` | 3 | `AuditEngagement`, `AuditPlan`, `Branch` |
| `compliance` | 5 | `BoardReport`, `ComplianceItem`, `NotificationQueue`, `User` |
| `examination-questions` | 1 | `ExaminationQuestion` |
| `loan-portfolio` | 3 | `AuditEngagement`, `AuditModule`, `PopulationRecord` |
| `module-admin` | 7 | `AuditModule`, `ExaminationNode` |
| `observations` | 3 | `ComplianceItem`, `Observation`, `ObservationTimeline` |
| `ram` | 4 | `Branch`, `RamAssessment`, `RamAssessmentScore` |
| `rbia` | 8 | `ActionPoint`, `AuditEngagement`, `AuditModule`, `BmResponseBatch`, `BranchRbiaScore`, `EngagementMeeting`, `EngagementModule`, `EngagementSectionNa`, `Evidence`, `ExaminationNode`, `ExaminationResponse`, `Observation` |
| `repeat-findings` | 2 | `Observation`, `ObservationTimeline` |
| `reports` | 3 | `AuditEngagement`, `BoardReport`, `ReportTemplate` |
| `sampling` | 2 | `PopulationRecord`, `SamplingConfig` |

## Background jobs

| Job | Audited | Tables touched directly |
|---|---|---|
| `compliance-escalation` | — | — |
| `deadline-reminder` | yes | `NotificationQueue`, `Observation` |
| `generate-board-report` | — | `User` |
| `notification-processor` | — | — |
| `overdue-escalation` | yes | `NotificationQueue`, `Observation`, `User` |
| `rbia-overdue-escalation` | yes | `BmResponseBatch`, `NotificationQueue`, `User` |
| `snapshot-metrics` | — | `DashboardSnapshot` |
| `verify-audit-chain` | yes | `AuditChainHead`, `AuditChainVerification`, `NotificationQueue`, `User` |
| `weekly-digest` | yes | `NotificationQueue`, `Observation`, `User` |

## Most widely accessed tables

Tables reached from the greatest number of domains — the ones where a schema change carries the widest blast radius.

| Table | Domains | Reached from |
|---|---|---|
| `AuditEngagement` | 6 | `account-examination`, `audit-execution`, `audit-plans`, `loan-portfolio`, `rbia`, `reports` |
| `Observation` | 5 | `(root)`, `jobs`, `observations`, `rbia`, `repeat-findings` |
| `Branch` | 4 | `admin`, `audit-execution`, `audit-plans`, `ram` |
| `AuditModule` | 4 | `audit-execution`, `loan-portfolio`, `module-admin`, `rbia` |
| `PopulationRecord` | 3 | `account-examination`, `loan-portfolio`, `sampling` |
| `ObservationTimeline` | 3 | `(root)`, `observations`, `repeat-findings` |
| `User` | 3 | `(root)`, `compliance`, `jobs` |
| `ExaminationQuestion` | 2 | `account-examination`, `examination-questions` |
| `ReportTemplate` | 2 | `admin`, `reports` |
| `EngagementModule` | 2 | `audit-execution`, `rbia` |
| `Evidence` | 2 | `(root)`, `rbia` |
| `BoardReport` | 2 | `compliance`, `reports` |
| `ComplianceItem` | 2 | `compliance`, `observations` |
| `NotificationQueue` | 2 | `compliance`, `jobs` |
| `ExaminationNode` | 2 | `module-admin`, `rbia` |

### Domain access graph

Domains that reach the most-shared tables. Edges mean direct Prisma access in that domain's modules; not every path a page can take.

```mermaid
flowchart LR
    subgraph hubs [Shared tables]
        T_AuditEngagement["AuditEngagement"]
        T_Observation["Observation"]
        T_Branch["Branch"]
        T_AuditModule["AuditModule"]
        T_PopulationRecord["PopulationRecord"]
        T_ObservationTimeline["ObservationTimeline"]
    end
    D_account_examination["account-examination"]
    D_account_examination --> T_AuditEngagement
    D_audit_execution["audit-execution"]
    D_audit_execution --> T_AuditEngagement
    D_audit_plans["audit-plans"]
    D_audit_plans --> T_AuditEngagement
    D_loan_portfolio["loan-portfolio"]
    D_loan_portfolio --> T_AuditEngagement
    D_rbia["rbia"]
    D_rbia --> T_AuditEngagement
    D_reports["reports"]
    D_reports --> T_AuditEngagement
    D__root_["(root)"]
    D__root_ --> T_Observation
    D_jobs["jobs"]
    D_jobs --> T_Observation
    D_observations["observations"]
    D_observations --> T_Observation
    D_rbia --> T_Observation
    D_repeat_findings["repeat-findings"]
    D_repeat_findings --> T_Observation
    D_admin["admin"]
    D_admin --> T_Branch
    D_audit_execution --> T_Branch
    D_audit_plans --> T_Branch
    D_ram["ram"]
    D_ram --> T_Branch
    D_audit_execution --> T_AuditModule
    D_loan_portfolio --> T_AuditModule
    D_module_admin["module-admin"]
    D_module_admin --> T_AuditModule
    D_rbia --> T_AuditModule
    D_account_examination --> T_PopulationRecord
    D_loan_portfolio --> T_PopulationRecord
    D_sampling["sampling"]
    D_sampling --> T_PopulationRecord
    D__root_ --> T_ObservationTimeline
    D_observations --> T_ObservationTimeline
    D_repeat_findings --> T_ObservationTimeline
```

## The observation lifecycle

The central workflow, and the tables each transition writes.

```mermaid
stateDiagram-v2
    [*] --> DRAFT: auditor creates
    DRAFT --> SUBMITTED: submit for review
    SUBMITTED --> REVIEWED: manager reviews
    REVIEWED --> ISSUED: issue to branch
    ISSUED --> RESPONSE: branch responds
    RESPONSE --> COMPLIANCE: compliance tracking
    COMPLIANCE --> CLOSED: close (CAE for HIGH/CRITICAL)
    CLOSED --> [*]
```

Every transition writes `Observation`, appends to `ObservationTimeline`, and — because both carry the audit trigger — inserts a row into `AuditLog`.

## The audited write path

How a mutation reaches the audit log.

```mermaid
flowchart TD
    A["Server action or job"] --> B["withAuditedMutation(actor, actionType)"]
    B --> C["BEGIN transaction"]
    C --> D["set_config('app.current_*') session GUCs"]
    D --> E["Business mutation on an audited table"]
    E --> F["AFTER-row trigger: audit_trigger_function()"]
    F --> G["INSERT into AuditLog"]
    G --> H["COMMIT"]
```

The trigger reads the tenant, user, action and justification from PostgreSQL session settings that `withAuditedMutation` sets inside the same transaction. A mutation made outside that wrapper writes an audit row with no attribution — which is why the discipline test in `src/data-access/__tests__/` fails the build when a new unaudited write appears.
