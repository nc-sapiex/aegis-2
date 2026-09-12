# AEGIS — Comprehensive Test Plan

> Quick functional verification for all 18 modules, 65 pages, 103 server action files, and 12 API endpoints.
> **Scope:** Smoke tests + critical path validation. Not exhaustive regression.
> **Test Users:** CEO (rajesh.deshmukh), CAE (priya.sharma), Auditor (amit.joshi), CCO (suresh.patil), Auditee (vikram.kulkarni), Admin (admin@testbank.example) — all password `TestPassword123!`

---

## Module 1: Authentication & Session Management

### 1.1 Login Flow

- [ ] **T001** — Navigate to `/login`, verify page renders (form fields, branding, RBI badge)
- [ ] **T002** — Login with CEO credentials → redirects to `/dashboard`
- [ ] **T003** — Login with invalid password → shows error message, no redirect
- [ ] **T004** — Login with non-existent email → shows generic error (no user enumeration)
- [ ] **T005** — Attempt 6 rapid logins with wrong password → account lockout message after 5th attempt
- [ ] **T006** — Verify session cookie is set (`better-auth.session_token` in dev, `__Secure-*` in prod)
- [ ] **T007** — Access `/dashboard` without login → redirects to `/login`

### 1.2 Session & Logout

- [ ] **T008** — Click logout → session cleared, redirected to `/login`
- [ ] **T009** — After logout, back-button doesn't access protected pages
- [ ] **T010** — API call `GET /api/auth/session` returns valid session data when logged in

### 1.3 Invitation Flow

- [ ] **T011** — Admin invites new user → invitation record created in DB
- [ ] **T012** — Accept invitation via `/accept-invite?token=...` → password setup form shown
- [ ] **T013** — Set password on invitation → user can login with new credentials

---

## Module 2: Dashboard & Analytics

### 2.1 Dashboard (`/dashboard`)

- [ ] **T014** — CEO sees all KPI widgets (compliance score, audit coverage, risk heat, pending items)
- [ ] **T015** — Auditor sees auditor-scoped widgets (assigned audits, pending observations)
- [ ] **T016** — Auditee sees auditee-scoped widgets (pending responses, overdue items)
- [ ] **T017** — All chart components render without errors (no NaN, no blank charts)
- [ ] **T018** — Widget data matches database state (spot-check 2-3 numbers)

### 2.2 Analytics (`/analytics`)

- [ ] **T019** — All 7 tabs load: Branch Risk, Audit Plans, Compliance, Findings, NPA, Controls, Risk MIS
- [ ] **T020** — Branch Risk tab shows risk heatmap with RAM data (R42)
- [ ] **T021** — Compliance tab shows aging analysis chart (R44)
- [ ] **T022** — Findings tab shows trend analysis across periods (R45)
- [ ] **T023** — NPA tab shows waterfall chart (R46)
- [ ] **T024** — Controls tab shows effectiveness analytics (R58)

### 2.3 Audit Trail (`/audit-trail`)

- [ ] **T025** — CAE can access audit trail page
- [ ] **T026** — Shows recent DB operations (table, user, action, timestamp)
- [ ] **T027** — Filter by table/user/action/date range works
- [ ] **T028** — Non-CAE users cannot access (permission denied)

---

## Module 3: RAM & Audit Planning

### 3.1 RAM Assessment (`/ram`, `/ram/[id]`)

- [ ] **T029** — RAM list page shows all assessments with status badges (DRAFT/COMPUTED/APPROVED)
- [ ] **T030** — Create new RAM assessment for a branch → status DRAFT
- [ ] **T031** — Score all 19 parameters → save scores (incremental)
- [ ] **T032** — Compute assessment → composite score calculated, status → COMPUTED
- [ ] **T033** — Frequency derived correctly: >3.5→12mo, 2.5-3.5→18mo, <2.5→24mo (R8)
- [ ] **T034** — Approve assessment (different user than computer) → status → APPROVED (maker-checker)
- [ ] **T035** — Same user cannot both compute and approve (maker-checker enforced)

### 3.2 Annual Audit Plan (`/audit-plans`)

- [ ] **T036** — Generate annual plan in preview mode → shows schedule without DB write
- [ ] **T037** — Commit annual plan → AuditPlan + engagements created from RAM scores (R9)
- [ ] **T038** — What-if simulator: override RAM scores → see changed frequencies/priorities (R53)
- [ ] **T039** — Surprise audit scheduler: schedule unannounced audit → audit number SA/YY/branch/### (R71)
- [ ] **T040** — Existing plans table shows all committed plans with engagement count

---

## Module 4: Audit Execution

### 4.1 Engagement Management

- [ ] **T041** — Create engagement → form with branch, audit type, period, audit areas
- [ ] **T042** — Engagement overview page shows header, section tabs, team panel
- [ ] **T043** — Assign team member → user appears in team panel (R13)
- [ ] **T044** — Remove team member → removed from panel
- [ ] **T045** — Refresh work program button visible with `work_program:execute` permission (R57)
- [ ] **T046** — Click refresh work program → generates/updates work items

### 4.2 Section Examination (`/audit-execution/[id]/sections/[code]`)

- [ ] **T047** — Section page shows examination items for selected area
- [ ] **T048** — Submit examination response (compliant/non-compliant/partial/NA) with observation
- [ ] **T049** — Non-compliant response auto-creates observation in DRAFT (R17)
- [ ] **T050** — Update section status (NOT_STARTED → IN_PROGRESS → COMPLETED)
- [ ] **T051** — Evidence upload: request presigned URL → upload file → confirm → file listed

### 4.3 Cash Verification (`/audit-execution/[id]/cash-verification`)

- [ ] **T052** — Cash verification form: cash-in-hand, book balance, retention limit
- [ ] **T053** — Difference auto-calculated (cash - book)
- [ ] **T054** — Retention exceeded flag triggers when cash > limit
- [ ] **T055** — Denomination capture works (JSONB data)

### 4.4 Loan Review (`/audit-execution/[id]/loan-review`)

- [ ] **T056** — Create loan review record manually → saved
- [ ] **T057** — Bulk import via CSV → records created (R25)
- [ ] **T058** — Edit/delete loan review records

### 4.5 SMA/NPA (`/audit-execution/[id]/sma-npa`)

- [ ] **T059** — Save SMA/NPA entries by category (SMA-0, SMA-1, SMA-2, NPA)
- [ ] **T060** — Upsert works (re-save same category updates existing)

### 4.6 BH Certificate (`/audit-execution/[id]/bh-certificate`)

- [ ] **T061** — Branch head signs certificate → status SIGNED (R26)
- [ ] **T062** — Senior manager countersigns → status COUNTERSIGNED
- [ ] **T063** — Certificate status readable by authorized users

### 4.7 Report Generation (`/audit-execution/[id]/report`)

- [ ] **T064** — Report page shows current status (DRAFT/REVIEWED/APPROVED/ISSUED)
- [ ] **T065** — Transition report: DRAFT → REVIEWED → APPROVED → ISSUED (R33)
- [ ] **T066** — Risk rating computed from observation scores (R31)
- [ ] **T067** — Rating bands applied: Poor/Moderate/Satisfactory/Good/Very Good (R32)

---

## Module 5: Findings & Observations

### 5.1 Findings List (`/findings`)

- [ ] **T068** — Severity summary cards show correct counts (Critical/High/Medium/Low)
- [ ] **T069** — Table lists all observations with filtering by status/severity/branch
- [ ] **T070** — Export to XLSX downloads file with color-coded severity

### 5.2 Create Observation (`/findings/new`)

- [ ] **T071** — Create observation with 5C fields → saved in DRAFT state
- [ ] **T072** — Branch and audit area selectors populated from tenant data
- [ ] **T073** — Repeat finding detection: similar title triggers pg_trgm match (R40)
- [ ] **T074** — Confirm repeat → links to historical finding
- [ ] **T075** — Dismiss repeat suggestion → proceeds as new finding

### 5.3 Observation Detail (`/findings/[id]`)

- [ ] **T076** — Detail view shows full observation with timeline
- [ ] **T077** — State transitions work per role: DRAFT → SUBMITTED → ISSUED → RESPONSE_DUE → CLOSED
- [ ] **T078** — Maker-checker: creator cannot approve own observation
- [ ] **T079** — Notification queued when observation ISSUED

### 5.4 Auditee Response (`/auditee`, `/auditee/[id]`)

- [ ] **T080** — Auditee sees pending observations assigned to their branch
- [ ] **T081** — Submit response with text + evidence → status updates
- [ ] **T082** — Evidence upload via S3 presigned URL works for auditee

---

## Module 6: Compliance Lifecycle

### 6.1 Compliance Registry (`/compliance`)

- [ ] **T083** — Status summary cards (Pending, In Progress, Overdue, Closed)
- [ ] **T084** — Create compliance items from observations
- [ ] **T085** — Branch response submission within 30-day SLA (R35)

### 6.2 ZAC Review

- [ ] **T086** — Zonal auditor reviews branch response → APPROVED/REJECTED/REQUEST_INFO (R36)
- [ ] **T087** — Rejected items return to branch for re-response

### 6.3 ACE Processing (`/compliance/ace`)

- [ ] **T088** — ACE officer sees L3+ escalated items (R37)
- [ ] **T089** — Process quarterly ACE cycle → items marked ACE_REVIEWED
- [ ] **T090** — Review individual compliance items at ACE level

### 6.4 ACB Reporting (`/compliance/acb`)

- [ ] **T091** — Generate ACB report → consolidates L4+ and ACE-reviewed items (R38)
- [ ] **T092** — Board view shows aggregated compliance metrics

### 6.5 Escalation Engine

- [ ] **T093** — Escalation levels compute correctly: L1(+15d) → L2(+30d) → L3(+90d) → L4(+180d) (R39)
- [ ] **T094** — The `compliance-escalation` pg-boss job runs daily and escalates open ComplianceItems per tenant
- [ ] **T095** — A tenant failing escalation does not stop the remaining tenants

---

## Module 7: Risk Management & Controls

### 7.1 Risk Register (`/risk-management`)

- [ ] **T096** — Risk register tab shows all risks with inherent/residual scores
- [ ] **T097** — Create risk entry → residualScore auto-computed
- [ ] **T098** — KRI dashboard shows current values vs thresholds (NORMAL/WARNING/BREACH) (R51)
- [ ] **T099** — Risk-audit linkage tab shows thematic mappings (R52)
- [ ] **T100** — Create risk-audit linkage with thematic area (CREDIT/OPS/COMPLIANCE/IT/GOVERNANCE)

### 7.2 Control Library (`/controls`, `/controls/[id]`)

- [ ] **T101** — Controls list shows all controls with framework mapping
- [ ] **T102** — Create control with test procedures
- [ ] **T103** — Control detail page shows effectiveness rating and test history
- [ ] **T104** — Test procedures linked to controls with pass criteria

### 7.3 Audit Universe (`/risk-management`)

- [ ] **T105** — Manage audit universe entities (branch, department, process, channel, vendor) (R69)
- [ ] **T106** — Delete entity blocked if linked to risk register

---

## Module 8: Issues & Action Plans

### 8.1 Issues (`/issues`)

- [ ] **T107** — Create issue from multiple sources (internal/regulatory/external/self-assessment) (R59)
- [ ] **T108** — Issue fields: severity, root cause, risk theme, linked controls (R60)
- [ ] **T109** — Close issue → blocked if open action plans exist
- [ ] **T110** — Accept risk with management sign-off (R62)

### 8.2 Action Plans

- [ ] **T111** — Create action plan with milestones for an issue (R61)
- [ ] **T112** — Track progress 0-100% → auto-status IN_PROGRESS/COMPLETED
- [ ] **T113** — Add evidence to action plan
- [ ] **T114** — Overdue detection: past due_date → OVERDUE status

### 8.3 Board View (`/issues/board`)

- [ ] **T115** — Consolidated view: aggregation by source/severity/theme (R63)
- [ ] **T116** — Shows overdue actions, QA gaps, KRI breaches

---

## Module 9: QA Assessment

### 9.1 Self-Assessment (`/qa-assessment`)

- [ ] **T117** — QA self-assessment questionnaires mapped to IIA Standards (R64)
- [ ] **T118** — Gap-to-issue conversion from QA findings (R65)
- [ ] **T119** — Bulk gap-to-issue conversion
- [ ] **T120** — Effectiveness KPIs tab shows 10+ audit metrics (R66)
- [ ] **T121** — Audit Health Dashboard renders all health indicators (R67)

### 9.2 Work Program (`/work-program`)

- [ ] **T122** — Work program shows items per engagement with assignment
- [ ] **T123** — Auto-generate work program from engagement + control library (R57)
- [ ] **T124** — Execute work item → record test result + findings
- [ ] **T125** — Assign work item to specific auditor
- [ ] **T126** — Completion updates ControlLibrary.effectivenessScore (R58)

---

## Module 10: Governance & Board

### 10.1 Governance Hub (`/governance`)

- [ ] **T127** — Policies tab: create/update/delete policy with versioning (R84)
- [ ] **T128** — Committees tab: create committee, add/remove members, schedule meetings (R85)
- [ ] **T129** — ACB Workspace tab: consolidated dashboards for board members (R81)
- [ ] **T130** — Agenda Builder tab: auto-generate quarterly ACB agenda pack (R82)
- [ ] **T131** — Board Calendar tab: RBI-mandated items on calendar (R83)
- [ ] **T132** — RBI Pack tab: one-click inspection support pack generation (R86)

---

## Module 11: Regulatory

### 11.1 RBI Observations (`/regulatory`)

- [ ] **T133** — Create regulatory observation with RBI reference/para number (R77)
- [ ] **T134** — ATR workflow: DRAFT → SUBMITTED → ACCEPTED/FURTHER_INFO (R78)
- [ ] **T135** — Para-to-issue mapping for internal tracking (R79)

### 11.2 Calendar (`/calendar`)

- [ ] **T136** — Unified calendar view: RBIA + concurrent + IS/EDP + statutory (R70)
- [ ] **T137** — Create/update/delete calendar events with periodicity
- [ ] **T138** — Fiscal year boundary (April 1 - March 31) works correctly

### 11.3 Housekeeping (`/housekeeping`)

- [ ] **T139** — Metrics capture: inter-branch, suspense, clearing account balances (R80)
- [ ] **T140** — Risk MIS dashboard shows CRAR, asset quality, liquidity, investment metrics (R87)
- [ ] **T141** — Inter-bank exposure monitoring: 20% total cap, 5% per-bank cap (R88)

---

## Module 12: Concurrent Audit

### 12.1 Concurrent Audit Hub (`/concurrent-audit`)

- [ ] **T142** — Scope templates tab: create/update/delete templates (cash, investments, etc.) (R73)
- [ ] **T143** — Rapid entry tab: batch create observations quickly (R74)
- [ ] **T144** — De-dup tab: shows potential duplicates with RBIA findings (R76)
- [ ] **T145** — "Link to RBIA" button sets repeatOfId on concurrent finding
- [ ] **T146** — "Mark Unique" button confirms finding is new
- [ ] **T147** — Escalation tab: serious irregularity auto-routing (R75)

---

## Module 13: IS/EDP Audit & Investments

### 13.1 IS Audit (`/is-audit`)

- [ ] **T148** — Application Inventory tab: manage IT app records (R98)
- [ ] **T149** — Audit Checklists tab: CBS, channels, access, BCP/DR, vendor, change mgmt (R99)
- [ ] **T150** — Vendor Risk tab: SLA compliance tracking (R100)
- [ ] **T151** — CBS Parameters tab: interest rates, product masters, privileges (R101)
- [ ] **T152** — Cyber Security tab: 122 questionnaires / 25 baseline controls (R103)
- [ ] **T153** — Cyber Security: file upload for evidence (S3 presigned URL)
- [ ] **T154** — Evidence & Gaps tab: CSV export and XLSX export buttons (R104)
- [ ] **T155** — XLSX gap analysis download → 3 sheets (Gap Summary, Detail, Remediation)

### 13.2 Investments (`/investments`)

- [ ] **T156** — Portfolio tab: view/manage investment records
- [ ] **T157** — SGL/CSGL Reconciliation tab: reconciliation tracking (R93)
- [ ] **T158** — Broker Analytics tab: 5% cap per broker enforcement (R94)
- [ ] **T159** — Non-SLR Cap tab: 10% of deposits monitoring (R95)
- [ ] **T160** — Classification tab: HTM/HFT/AFS audit checklist (R96)
- [ ] **T161** — Quarterly Certification tab: submit certification → ACB notified (R97)
- [ ] **T162** — Verify ACB members receive notification after certification

---

## Module 14: Reports & Exports

### 14.1 Report Hub (`/reports`)

- [ ] **T163** — Report generation page loads with template options
- [ ] **T164** — Generate XLSX multi-tab report → download works (R29)
- [ ] **T165** — Generate PDF summary report → download works (R30)
- [ ] **T166** — Report history shows previously generated reports with re-download

### 14.2 XLSX Exports

- [ ] **T167** — `GET /api/exports/findings` → XLSX with severity coloring
- [ ] **T168** — `GET /api/exports/compliance` → XLSX with compliance data
- [ ] **T169** — `GET /api/exports/audit-plans` → XLSX with plan/engagement data
- [ ] **T170** — `GET /api/reports/gap-analysis` → 3-sheet XLSX

### 14.3 PDF Reports

- [ ] **T171** — `POST /api/reports/board-report` → PDF generated, stored in S3
- [ ] **T172** — `GET /api/reports/board-report?id=...` → presigned download URL

### 14.4 Export Permissions

- [ ] **T173** — CEO can access all exports
- [ ] **T174** — Auditor sees only own findings in export
- [ ] **T175** — Auditee sees only assigned observations in export
- [ ] **T176** — Unauthorized role gets 403 on restricted exports

---

## Module 15: Admin & Configuration

### 15.1 User Management (`/admin/users`)

- [ ] **T177** — List all users with roles and status
- [ ] **T178** — Invite new user → email invitation sent (or console-logged)
- [ ] **T179** — Update user roles (no self-role-change enforced)
- [ ] **T180** — Resend/revoke pending invitation
- [ ] **T181** — Multi-role assignment works (user gets union of permissions)

### 15.2 Branch Management (`/admin/branches`)

- [ ] **T182** — List branches with zone, category, business size
- [ ] **T183** — Update branch profile (zone, staff strength, audit frequency)

### 15.3 Zone Management (`/admin/zones`)

- [ ] **T184** — Create/update zone
- [ ] **T185** — Delete zone blocked if branches are linked

### 15.4 Templates (`/admin/templates`)

- [ ] **T186** — Create report template with versioning
- [ ] **T187** — Deactivate template → previous version deactivated

### 15.5 RAM Config (`/admin/ram-config`)

- [ ] **T188** — View 19 RAM parameters with weights and max scores
- [ ] **T189** — Parameters show active/inactive status

### 15.6 Settings (`/settings`)

- [ ] **T190** — Update tenant settings (name, registration, RBI circle)
- [ ] **T191** — Notification preferences page loads and saves
- [ ] **T192** — Compliance config page loads and saves

---

## Module 16: API Endpoints

### 16.1 Health & Auth

- [ ] **T193** — `GET /api/health` → `{"status":"ok","db":"connected"}`
- [ ] **T194** — `POST /api/auth/sign-in/email` → 200 with session token
- [ ] **T195** — `POST /api/auth/sign-in/email` with wrong password → error response
- [ ] **T196** — `GET /api/auth/session` with valid cookie → session data

### 16.2 Dashboard API

- [ ] **T197** — `GET /api/dashboard?widgets=compliance-score` → widget data JSON
- [ ] **T198** — `GET /api/dashboard` without widgets → empty object

### 16.3 Download API

- [ ] **T199** — `GET /api/download?key=valid-key` → 302 redirect to S3
- [ ] **T200** — `GET /api/download?key=../etc/passwd` → 400 (path traversal blocked)
- [ ] **T201** — `GET /api/download` without key → 400

### 16.4 Cron

- [ ] **T202** — `POST /api/cron/escalation` with valid secret → 200 with summary
- [ ] **T203** — `POST /api/cron/escalation` without secret → 401

---

## Module 17: Cross-Cutting Concerns

### 17.1 Multi-Tenancy

- [ ] **T204** — User from Tenant A cannot see Tenant B data (spot-check 3 pages)
- [ ] **T205** — All DAL queries include `WHERE tenantId = ?` (code review)
- [ ] **T206** — Session tenantId used (never from URL/body)

### 17.2 RBAC & Permissions

- [ ] **T207** — Each of 6 test roles can access their permitted pages
- [ ] **T208** — Each of 6 test roles is blocked from unauthorized pages (403 or redirect)
- [ ] **T209** — Multi-role user gets union of permissions from all roles

### 17.3 Internationalization (i18n)

- [ ] **T210** — Switch language to Hindi → UI labels change
- [ ] **T211** — Switch language to Marathi → UI labels change
- [ ] **T212** — Switch language to Gujarati → UI labels change
- [ ] **T213** — Date formatting uses Indian locale (en-IN)

### 17.4 Notifications

- [ ] **T214** — Notification queued on observation ISSUED
- [ ] **T215** — ACB notification queued on investment certification (R97)
- [ ] **T216** — Notification preferences respected (opt-out works)

### 17.5 Audit Trail

- [ ] **T217** — Create/update/delete operations logged in audit trail
- [ ] **T218** — Audit trail includes userId, action, table, timestamp
- [ ] **T219** — Sensitive operations (role change, approval) captured

### 17.6 Error Handling

- [ ] **T220** — Invalid form submission shows field-level validation errors
- [ ] **T221** — Server action failure shows toast error message
- [ ] **T222** — 404 page renders for non-existent routes
- [ ] **T223** — API endpoints return proper HTTP status codes (400, 401, 403, 500)

---

## Module 18: Repeat Finding & Risk Uplift (R40)

- [ ] **T224** — Create observation with similar title to closed finding → repeat candidates shown
- [ ] **T225** — Confirm as repeat → linked to original, 1.5x multiplier flagged
- [ ] **T226** — Next RAM computation applies 1.5x uplift for branches with repeat findings

---

## Summary

| Category                    | Test Count     | Priority |
| --------------------------- | -------------- | -------- |
| Authentication & Sessions   | T001-T013 (13) | Critical |
| Dashboard & Analytics       | T014-T028 (15) | High     |
| RAM & Planning              | T029-T040 (12) | High     |
| Audit Execution             | T041-T067 (27) | Critical |
| Findings & Observations     | T068-T082 (15) | Critical |
| Compliance Lifecycle        | T083-T095 (13) | Critical |
| Risk Management & Controls  | T096-T106 (11) | High     |
| Issues & Action Plans       | T107-T116 (10) | High     |
| QA Assessment               | T117-T126 (10) | Medium   |
| Governance & Board          | T127-T132 (6)  | Medium   |
| Regulatory                  | T133-T141 (9)  | Medium   |
| Concurrent Audit            | T142-T147 (6)  | Medium   |
| IS/EDP Audit & Investments  | T148-T162 (15) | High     |
| Reports & Exports           | T163-T176 (14) | High     |
| Admin & Configuration       | T177-T192 (16) | Medium   |
| API Endpoints               | T193-T203 (11) | Critical |
| Cross-Cutting Concerns      | T204-T223 (20) | Critical |
| Repeat Finding & RAM Uplift | T224-T226 (3)  | High     |
| **Total**                   | **226 tests**  |          |

---

## Execution Notes

- **Environment:** Production (aegis.nexlyadvisory.com) or local dev (localhost:3000)
- **Prerequisites:** Seed data loaded (10 users, 2 tenants), S3 optional (evidence upload tests skip if unconfigured)
- **Tools:** Browser (manual), curl/httpie (API), Playwright (E2E automation)
- **Duration estimate:** ~4-6 hours for full manual pass
- **Automation priority:** T001-T013 (auth), T193-T203 (API), T068-T082 (findings lifecycle)

---

## Appendix: Requirements Traceability (R1-R104)

Every requirement maps to at least one test. Schema-only requirements (marked `*`) are validated implicitly through functional tests that exercise the underlying models.

| Req  | Description                                                    | Tests            | Coverage   |
| ---- | -------------------------------------------------------------- | ---------------- | ---------- |
| R1   | Role enum extension (LEAD_AUDITOR, FIELD_AUDITOR, BRANCH_HEAD) | T043, T207       | Implicit\* |
| R2   | Zone model with branch→zone mapping                            | T184, T182       | Implicit\* |
| R3   | Branch: zone, category, business_size, staff_strength          | T182, T183       | Direct     |
| R4   | RamParameterConfig: 19 params with weights                     | T188, T189       | Direct     |
| R5   | RamAssessment: per branch/year with composite_score            | T030-T034        | Direct     |
| R6   | RamAssessmentScore: assessment + param + score                 | T031             | Implicit\* |
| R7   | RAM computation service: weighted scoring                      | T032             | Direct     |
| R8   | Frequency rules: >3.5→12mo, 2.5-3.5→18mo, <2.5→24mo            | T033             | Direct     |
| R9   | Annual audit plan generator from RAM                           | T036, T037       | Direct     |
| R10  | AuditTeamMember join model                                     | T043, T044       | Implicit\* |
| R11  | AuditEngagement extended fields                                | T041, T042       | Implicit\* |
| R12  | Pre-audit branch profiling                                     | T042             | Direct     |
| R13  | Pre-audit team assignment with section allocation              | T043             | Direct     |
| R14  | ExaminationArea table: 25 areas                                | T047             | Implicit\* |
| R15  | ExaminationItem table: 239 items                               | T047             | Implicit\* |
| R16  | AuditExaminationResponse model                                 | T048             | Implicit\* |
| R17  | Auto-create Observation from non-compliant                     | T049             | Direct     |
| R18  | AuditSectionInstance model                                     | T047, T050       | Implicit\* |
| R19  | CashCheck model                                                | T052-T055        | Implicit\* |
| R20  | LoanReview model                                               | T056-T058        | Implicit\* |
| R21  | SmaNpaEntry model                                              | T059, T060       | Implicit\* |
| R22  | Section-based execution UI with 25 tabs                        | T047             | Direct     |
| R23  | Per-item examination response form                             | T048             | Direct     |
| R24  | Cash verification with denomination capture                    | T052-T055        | Direct     |
| R25  | Loan review with bulk CSV import                               | T057             | Direct     |
| R26  | BH Certificate workflow                                        | T061-T063        | Direct     |
| R27  | Evidence model generalization                                  | T051, T082       | Implicit\* |
| R28  | Seed data: 19 RAM params + 25 areas + 239 items                | T188, T047       | Implicit\* |
| R29  | XLSX multi-tab report (13+ sheets)                             | T164             | Direct     |
| R30  | PDF summary report                                             | T165             | Direct     |
| R31  | Risk rating computation with 1.5x repeat                       | T066             | Direct     |
| R32  | Rating bands: Poor/Moderate/Satisfactory/Good/Very Good        | T067             | Direct     |
| R33  | Report routing: draft→reviewed→approved→issued                 | T065             | Direct     |
| R34  | ComplianceItem model                                           | T084             | Implicit\* |
| R35  | Branch response portal within 30-day SLA                       | T085             | Direct     |
| R36  | ZAC review stage                                               | T086, T087       | Direct     |
| R37  | ACE processing quarterly cycle                                 | T088-T090        | Direct     |
| R38  | ACB reporting board meeting cycle                              | T091, T092       | Direct     |
| R39  | Escalation engine L1-L4                                        | T093-T095        | Direct     |
| R40  | Repeat finding 1.5x risk weight                                | T224-T226        | Direct     |
| R41  | ZONAL_AUDITOR role                                             | T086, T207       | Implicit\* |
| R42  | Branch risk heatmap with RAM data                              | T020             | Direct     |
| R43  | Audit plan progress dashboard                                  | T040             | Direct     |
| R44  | Compliance aging analysis                                      | T021             | Direct     |
| R45  | Finding trend analysis                                         | T022             | Direct     |
| R46  | NPA movement waterfall                                         | T023             | Direct     |
| R47  | Audit calendar management                                      | T136-T138        | Direct     |
| R48  | Template management with versioning                            | T186, T187       | Direct     |
| R49  | AuditUniverseEntity model                                      | T105             | Implicit\* |
| R50  | RiskRegister model                                             | T096, T097       | Direct     |
| R51  | KeyRiskIndicator model                                         | T098             | Direct     |
| R52  | Risk-to-audit linkage                                          | T099, T100       | Direct     |
| R53  | What-if simulation                                             | T038             | Direct     |
| R54  | ControlLibrary model                                           | T101             | Implicit\* |
| R55  | TestProcedure model                                            | T102, T104       | Direct     |
| R56  | WorkProgramItem model                                          | T122             | Implicit\* |
| R57  | Auto-generate work program                                     | T045, T046, T123 | Direct     |
| R58  | Control effectiveness analytics                                | T024, T126       | Direct     |
| R59  | Issue model (unified sources)                                  | T107             | Direct     |
| R60  | Issue fields: severity, root cause, risk theme                 | T108             | Direct     |
| R61  | ActionPlan with milestones                                     | T111, T112       | Direct     |
| R62  | Accepted risk tracking                                         | T110             | Direct     |
| R63  | Consolidated Board view                                        | T115, T116       | Direct     |
| R64  | QA self-assessment questionnaires                              | T117             | Direct     |
| R65  | Gap-to-issue conversion                                        | T118, T119       | Direct     |
| R66  | Internal audit effectiveness KPIs                              | T120             | Direct     |
| R67  | Audit Function Health dashboard                                | T121             | Direct     |
| R68  | ACE_OFFICER role                                               | T088, T207       | Implicit\* |
| R69  | Audit universe entity registry                                 | T105             | Direct     |
| R70  | Unified calendar (RBIA + concurrent + IS + statutory)          | T136             | Direct     |
| R71  | Surprise audit scheduling                                      | T039             | Direct     |
| R72  | CONCURRENT_AUDITOR role                                        | T142, T207       | Implicit\* |
| R73  | Concurrent audit scope templates                               | T142             | Direct     |
| R74  | Rapid observation entry workbench                              | T143             | Direct     |
| R75  | Serious irregularity escalation                                | T147             | Direct     |
| R76  | De-duplication: concurrent → RBIA                              | T144-T146        | Direct     |
| R77  | RegulatoryObservation model                                    | T133             | Direct     |
| R78  | ATR workflow: draft→submitted→accepted                         | T134             | Direct     |
| R79  | Para-to-issue mapping                                          | T135             | Direct     |
| R80  | Housekeeping risk metrics                                      | T139             | Direct     |
| R81  | ACB workspace with dashboards                                  | T129             | Direct     |
| R82  | ACB agenda builder                                             | T130             | Direct     |
| R83  | Board review calendar                                          | T131             | Direct     |
| R84  | PolicyDocument model with versioning                           | T127             | Direct     |
| R85  | Committee governance                                           | T128             | Direct     |
| R86  | RBI inspection support pack                                    | T132             | Direct     |
| R87  | Risk management MIS dashboards                                 | T140             | Direct     |
| R88  | Inter-bank exposure monitoring                                 | T141             | Direct     |
| R89  | IS_AUDITOR role                                                | T148, T207       | Implicit\* |
| R90  | RISK_HEAD role                                                 | T207             | Implicit\* |
| R91  | ACB_MEMBER role                                                | T162, T207       | Implicit\* |
| R92  | SYSTEM_ADMIN role                                              | T207             | Implicit\* |
| R93  | SGL/CSGL reconciliation tracking                               | T157             | Direct     |
| R94  | Broker compliance (5% cap)                                     | T158             | Direct     |
| R95  | Non-SLR cap monitoring (10% deposits)                          | T159             | Direct     |
| R96  | HTM/HFT/AFS classification checklist                           | T160             | Direct     |
| R97  | Quarterly certification + ACB notification                     | T161, T162       | Direct     |
| R98  | ApplicationInventory model                                     | T148             | Direct     |
| R99  | IS audit checklists (6 categories)                             | T149             | Direct     |
| R100 | Vendor risk tracking with SLA                                  | T150             | Direct     |
| R101 | CBS parameter audit items                                      | T151             | Direct     |
| R102 | IS_AUDITOR role with scoped access                             | T207             | Implicit\* |
| R103 | Cyber security checklist (122 items)                           | T152, T153       | Direct     |
| R104 | Tech control evidence + gap analysis                           | T154, T155       | Direct     |

**Coverage: 104/104 requirements mapped. 85 Direct, 19 Implicit (schema/role).**
