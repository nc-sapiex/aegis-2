# Route List

> **Generated file — do not edit by hand.**
> Produced by `scripts/generate-reference-docs.mjs` from `prisma/schema.prisma`
> and the `src/` tree. Regenerate with `pnpm docs:reference`.
>
> Source commit: `e28e78f` (module-admin-reporting/foundation)

Every addressable path in the application: **51 pages** and
**10 HTTP endpoints**.

Pages are React Server Components under the Next.js App Router. Route groups in
parentheses — `(dashboard)`, `(auth)` — organise files without appearing in
the URL, so they are stripped here.

## Pages

| Route | Source |
|---|---|
| `/` | `src/app/page.tsx` |
| `/accept-invite` | `src/app/accept-invite/page.tsx` |
| `/admin` | `src/app/(dashboard)/admin/page.tsx` |
| `/admin/audit-chain` | `src/app/(dashboard)/admin/audit-chain/page.tsx` |
| `/admin/branches` | `src/app/(dashboard)/admin/branches/page.tsx` |
| `/admin/ram-config` | `src/app/(dashboard)/admin/ram-config/page.tsx` |
| `/admin/templates` | `src/app/(dashboard)/admin/templates/page.tsx` |
| `/admin/users` | `src/app/(dashboard)/admin/users/page.tsx` |
| `/admin/zones` | `src/app/(dashboard)/admin/zones/page.tsx` |
| `/analytics` | `src/app/(dashboard)/analytics/page.tsx` |
| `/audit-execution` | `src/app/(dashboard)/audit-execution/page.tsx` |
| `/audit-execution/[engagementId]` | `src/app/(dashboard)/audit-execution/[engagementId]/page.tsx` |
| `/audit-execution/[engagementId]/bh-certificate` | `src/app/(dashboard)/audit-execution/[engagementId]/bh-certificate/page.tsx` |
| `/audit-execution/[engagementId]/cash-verification` | `src/app/(dashboard)/audit-execution/[engagementId]/cash-verification/page.tsx` |
| `/audit-execution/[engagementId]/rbia` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/page.tsx` |
| `/audit-execution/[engagementId]/rbia/examination/[moduleCode]` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/examination/[moduleCode]/page.tsx` |
| `/audit-execution/[engagementId]/rbia/findings` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/findings/page.tsx` |
| `/audit-execution/[engagementId]/rbia/loan-portfolio` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/loan-portfolio/page.tsx` |
| `/audit-execution/[engagementId]/rbia/meetings` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/meetings/page.tsx` |
| `/audit-execution/[engagementId]/rbia/module/[moduleCode]` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/module/[moduleCode]/page.tsx` |
| `/audit-execution/[engagementId]/rbia/questions` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/questions/page.tsx` |
| `/audit-execution/[engagementId]/rbia/sampling` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/sampling/page.tsx` |
| `/audit-execution/[engagementId]/rbia/score` | `src/app/(dashboard)/audit-execution/[engagementId]/rbia/score/page.tsx` |
| `/audit-execution/[engagementId]/report` | `src/app/(dashboard)/audit-execution/[engagementId]/report/page.tsx` |
| `/audit-execution/create` | `src/app/(dashboard)/audit-execution/create/page.tsx` |
| `/audit-plans` | `src/app/(dashboard)/audit-plans/page.tsx` |
| `/audit-trail` | `src/app/(dashboard)/audit-trail/page.tsx` |
| `/auditee` | `src/app/(dashboard)/auditee/page.tsx` |
| `/auditee/[id]` | `src/app/(dashboard)/auditee/[id]/page.tsx` |
| `/auditee/[id]/action-points` | `src/app/(dashboard)/auditee/[id]/action-points/page.tsx` |
| `/calendar` | `src/app/(dashboard)/calendar/page.tsx` |
| `/compliance` | `src/app/(dashboard)/compliance/page.tsx` |
| `/compliance/acb` | `src/app/(dashboard)/compliance/acb/page.tsx` |
| `/compliance/ace` | `src/app/(dashboard)/compliance/ace/page.tsx` |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` |
| `/findings` | `src/app/(dashboard)/findings/page.tsx` |
| `/findings/[id]` | `src/app/(dashboard)/findings/[id]/page.tsx` |
| `/findings/new` | `src/app/(dashboard)/findings/new/page.tsx` |
| `/forgot-password` | `src/app/(auth)/forgot-password/page.tsx` |
| `/login` | `src/app/(auth)/login/page.tsx` |
| `/onboarding` | `src/app/(onboarding)/onboarding/page.tsx` |
| `/pre-audit-profiling/[branchId]` | `src/app/(dashboard)/pre-audit-profiling/[branchId]/page.tsx` |
| `/ram` | `src/app/(dashboard)/ram/page.tsx` |
| `/ram/[assessmentId]` | `src/app/(dashboard)/ram/[assessmentId]/page.tsx` |
| `/reports` | `src/app/(dashboard)/reports/page.tsx` |
| `/reset-password` | `src/app/(auth)/reset-password/page.tsx` |
| `/settings` | `src/app/(dashboard)/settings/page.tsx` |
| `/settings/compliance` | `src/app/(dashboard)/settings/compliance/page.tsx` |
| `/settings/modules` | `src/app/(dashboard)/settings/modules/page.tsx` |
| `/settings/modules/[moduleCode]/statements` | `src/app/(dashboard)/settings/modules/[moduleCode]/statements/page.tsx` |
| `/settings/notifications` | `src/app/(dashboard)/settings/notifications/page.tsx` |

## HTTP endpoints

| Endpoint | Methods | Rendering | Purpose |
|---|---|---|---|
| `/api/auth/[...all]` | — | default | Better Auth API route handler |
| `/api/dashboard` | GET | force-dynamic |  |
| `/api/download` | GET | force-dynamic | Generate a presigned S3 download URL and redirect to it. |
| `/api/exports/audit-plans` | GET | force-dynamic |  |
| `/api/exports/compliance` | GET | force-dynamic |  |
| `/api/exports/findings` | GET | force-dynamic |  |
| `/api/health` | GET | force-dynamic |  |
| `/api/loan-portfolio/template` | GET | force-dynamic | Returns a downloadable Excel template for the specified loan module. |
| `/api/reports/board-report` | POST, GET | force-dynamic | Generate a PDF board report, store in S3, create audit trail record. |
| `/api/reports/gap-analysis` | GET | force-dynamic | Generate XLSX gap analysis report from IS audit checklists (R104). |
