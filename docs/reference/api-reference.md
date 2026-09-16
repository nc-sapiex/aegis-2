# API Reference

> **Generated file — do not edit by hand.**
> Produced by `scripts/generate-reference-docs.mjs` from `prisma/schema.prisma`
> and the `src/` tree. Regenerate with `pnpm docs:reference`.
>
> Source commit: `ca28305` (cursor/ci-autofix-automation-5587)

AEGIS has two callable surfaces.

**HTTP endpoints** (10) are conventional routes under `/api`, used
for file downloads, streamed exports and health checks.

**Server actions** (100 exported
functions across 61 modules) are the primary surface. They are
invoked directly from React components rather than over HTTP, so they have no
URL — the function signature is the contract. Every one runs on the server and
derives the caller's tenant from the session.

The *Audited* column marks modules routing writes through
`withAuditedMutation`, which opens the transaction and sets the session context
the database audit trigger reads.

## HTTP endpoints

### `— /api/auth/[...all]`

Better Auth API route handler

- Source: `src/app/api/auth/[...all]/route.ts`
- Rendering: `default`

### `GET /api/dashboard`

- Source: `src/app/api/dashboard/route.ts`
- Rendering: `force-dynamic`

### `GET /api/download`

Generate a presigned S3 download URL and redirect to it.

- Source: `src/app/api/download/route.ts`
- Rendering: `force-dynamic`

### `GET /api/exports/audit-plans`

- Source: `src/app/api/exports/audit-plans/route.ts`
- Rendering: `force-dynamic`

### `GET /api/exports/compliance`

- Source: `src/app/api/exports/compliance/route.ts`
- Rendering: `force-dynamic`

### `GET /api/exports/findings`

- Source: `src/app/api/exports/findings/route.ts`
- Rendering: `force-dynamic`

### `GET /api/health`

- Source: `src/app/api/health/route.ts`
- Rendering: `force-dynamic`

### `GET /api/loan-portfolio/template`

Returns a downloadable Excel template for the specified loan module.

- Source: `src/app/api/loan-portfolio/template/route.ts`
- Rendering: `force-dynamic`

### `POST / GET /api/reports/board-report`

Generate a PDF board report, store in S3, create audit trail record.

- Source: `src/app/api/reports/board-report/route.ts`
- Rendering: `force-dynamic`

### `GET /api/reports/gap-analysis`

Generate XLSX gap analysis report from IS audit checklists (R104).

- Source: `src/app/api/reports/gap-analysis/route.ts`
- Rendering: `force-dynamic`

## Server actions

### (root)

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `auditee.ts` | — | `submitAuditeeResponse`, `requestEvidenceUpload`, `confirmEvidenceUpload`, `getEvidenceDownloadUrl` | AuditeeResponse, Evidence, Observation, ObservationTimeline |
| `compliance-management.ts` | — | `addCustomRequirement`, `markAsNotApplicable`, `revertNotApplicable`, `fetchMasterDirections`, `fetchMasterDirectionItems`, `searchCirculars`, `fetchCustomRequirements` | — |
| `notification-preferences.ts` | — | `updatePreferences` | — |
| `onboarding-excel-upload.ts` | — | `downloadOrgStructureTemplate`, `uploadOrgStructureExcel` | — |
| `onboarding.ts` | — | `saveWizardStep`, `getWizardProgress`, `completeOnboarding` | — |
| `settings.ts` | — | `updateTenantSettings` | Tenant |
| `user-invitations.ts` | yes | `sendUserInvitations`, `acceptInvitation`, `resendInvitation`, `revokeInvitation` | Account, User |
| `users.ts` | — | `updateUserRoles` | — |

### account-examination

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `account-examination/save-response.ts` | yes | `saveAccountExamResponse` | AccountExamResponse, AuditEngagement, ExaminationQuestion, PopulationRecord |

### admin

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `admin/audit-chain.ts` | — | `runAuditChainVerification`, `exportChainAttestation` | — |
| `admin/manage-branch.ts` | yes | `updateBranchProfile` | Branch |
| `admin/manage-calendar.ts` | — | `createCalendarEvent`, `updateCalendarEvent`, `deleteCalendarEvent` | AuditCalendar |
| `admin/manage-templates.ts` | — | `createReportTemplate`, `deactivateTemplate` | ReportTemplate |
| `admin/manage-zone.ts` | — | `manageZone`, `deleteZone` | Zone |

### audit-execution

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `audit-execution/assign-team.ts` | — | `assignTeamMember`, `removeTeamMember` | AuditTeamMember |
| `audit-execution/bh-certificate.ts` | — | `signBhCertificate`, `countersignBhCertificate`, `getBhCertificateStatus` | AuditEngagement |
| `audit-execution/cash-verification.ts` | — | `saveCashVerification`, `getCashVerificationAction` | AuditEngagement, CashCheck |
| `audit-execution/create-engagement.ts` | — | `createEngagement` | AuditEngagement, AuditModule, Branch, EngagementModule |
| `audit-execution/import-loan-csv.ts` | — | `importLoanReviewCsv` | AuditEngagement |
| `audit-execution/transition-engagement-status.ts` | — | `transitionEngagementStatus` | AuditEngagement |

### audit-plans

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `audit-plans/generate-annual-plan.ts` | — | `generateAnnualPlan` | AuditEngagement, AuditPlan |
| `audit-plans/schedule-surprise-audit.ts` | — | `scheduleSurpriseAudit` | AuditEngagement, AuditPlan, Branch |
| `audit-plans/simulate-plan.ts` | — | `simulatePlan` | Branch |

### compliance

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `compliance/acb-reporting.ts` | — | `generateAcbReport` | BoardReport, ComplianceItem |
| `compliance/ace-processing.ts` | — | `processAceQuarterly`, `reviewAceItem` | ComplianceItem |
| `compliance/run-escalation-job.ts` | yes | `runEscalationJob`, `runEscalationJobInternal` | ComplianceItem, NotificationQueue, User |
| `compliance/submit-branch-response.ts` | — | `submitBranchResponse` | ComplianceItem |
| `compliance/zac-review.ts` | — | `zacReviewCompliance` | ComplianceItem |

### examination-questions

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `examination-questions/manage-questions.ts` | — | `addQuestion`, `updateQuestion`, `deactivateQuestion`, `reactivateQuestion` | ExaminationQuestion |

### loan-portfolio

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `loan-portfolio/get-portfolio-summary.ts` | — | `getPortfolioSummary` | — |
| `loan-portfolio/import-loan-portfolio.ts` | yes | `importLoanPortfolio` | AuditEngagement, AuditModule, PopulationRecord |
| `loan-portfolio/parse-excel-file.ts` | — | `parseExcelFile` | — |

### module-admin

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `module-admin/add-bank-statement.ts` | yes | `addBankStatement` | AuditModule, ExaminationNode |
| `module-admin/edit-statement.ts` | yes | `editStatement` | ExaminationNode |
| `module-admin/install-pack.ts` | — | `installPackAction` | — |
| `module-admin/reorder-statement.ts` | yes | `reorderStatement` | ExaminationNode |
| `module-admin/save-module-weights.ts` | yes | `saveModuleWeights` | AuditModule |
| `module-admin/toggle-module.ts` | yes | `toggleModule` | AuditModule |
| `module-admin/uninstall-pack.ts` | yes | `uninstallPackAction` | — |

### observations

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `observations/create.ts` | — | `createObservation` | Observation, ObservationTimeline |
| `observations/resolve-fieldwork.ts` | — | `resolveFieldwork` | Observation, ObservationTimeline |
| `observations/transition.ts` | — | `transitionObservation` | ComplianceItem, Observation, ObservationTimeline |

### ram

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `ram/approve-assessment.ts` | yes | `approveRamAssessment` | RamAssessment |
| `ram/compute-assessment.ts` | yes | `computeRamAssessment` | Branch, RamAssessment |
| `ram/create-assessment.ts` | yes | `createRamAssessment` | Branch, RamAssessment |
| `ram/save-scores.ts` | yes | `saveRamScores` | RamAssessment, RamAssessmentScore |

### rbia

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `rbia/bm-evidence.ts` | — | `requestBmEvidenceUpload`, `confirmBmEvidenceUpload` | ActionPoint, Evidence |
| `rbia/examination.ts` | yes | `saveExaminationResponse`, `autoSelectModulesAction`, `addModuleSelectionAction`, `removeModuleSelectionAction` | ActionPoint, AuditEngagement, AuditModule, EngagementModule, ExaminationNode, ExaminationResponse |
| `rbia/findings.ts` | yes | `createActionPoint`, `updateActionPoint`, `deleteActionPoint`, `promoteToObservation`, `submitBmResponse` | ActionPoint, AuditEngagement, BmResponseBatch, Observation |
| `rbia/freeze.ts` | yes | `freezeRbiaScore` | ActionPoint, AuditEngagement, BmResponseBatch, BranchRbiaScore, EngagementModule, ExaminationNode, ExaminationResponse |
| `rbia/meetings.ts` | — | `recordMeeting`, `signOffMeeting` | AuditEngagement, EngagementMeeting |
| `rbia/revise-score.ts` | yes | `reviseScore` | ExaminationResponse |
| `rbia/score-statement.ts` | yes | `scoreStatement` | AuditEngagement, ExaminationResponse |
| `rbia/section-not-applicable.ts` | yes | `setSectionNotApplicable` | EngagementSectionNa, ExaminationNode, ExaminationResponse |

### repeat-findings

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `repeat-findings/confirm.ts` | yes | `confirmRepeatFinding`, `dismissRepeatFinding` | Observation, ObservationTimeline |
| `repeat-findings/detect.ts` | — | `detectRepeatFindings` | — |

### reports

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `reports/generate-pdf.ts` | yes | `generatePdfReport` | BoardReport, ReportTemplate |
| `reports/generate-xlsx.ts` | yes | `generateXlsxReport` | BoardReport, ReportTemplate |
| `reports/transition-report.ts` | — | `transitionReportStatus` | AuditEngagement |

### sampling

| Module | Audited | Exported functions | Tables touched |
|---|---|---|---|
| `sampling/generate-sample.ts` | yes | `generateSampleAction` | PopulationRecord, SamplingConfig |
| `sampling/save-criteria.ts` | — | `saveSamplingCriteria` | SamplingConfig |

