import { test, expect, type Page } from "@playwright/test";

/**
 * The full RBIA cycle in one deterministic run (spec §10). Tagged @smoke —
 * this becomes a required branch-protection check (spec §9/§11 week 12).
 *
 * ── How to run it ──────────────────────────────────────────────────────────
 * The database must carry the whole seed chain, not just `pnpm db:seed`:
 *
 *   pnpm db:seed && pnpm seed:rbia-housing && pnpm seed:exam-questions \
 *     && pnpm seed:lifecycle
 *
 * `pnpm db:seed` alone leaves no ExaminationNodes, so no module has any
 * statements to examine, and no `eng2` fixture for the fieldwork half below.
 * Re-running `db:seed` on top of lifecycle data fails on a Branch foreign key;
 * a repeat run needs `prisma db push --force-reset` + `pnpm db:bootstrap`
 * first.
 *
 * `playwright.config.ts` runs this spec in exactly one project (`core`) — the
 * five role projects exclude it. Replaying a cycle that creates a RAM
 * assessment, an annual plan and an engagement five times against one database
 * is not deterministic.
 *
 * ── What this covers, and the three gaps it cannot ─────────────────────────
 * Covered end to end through real UI: RAM scored → computed → approved; annual
 * plan previewed → committed; engagement created with modules auto-selected
 * from the branch profile; the five-point examination register; score freeze;
 * engagement driven to COMPLETED; observation taken through maker-checker to
 * ISSUED and answered by the branch; an xlsx report downloaded.
 *
 * Gap 1 — team assignment is not exercised through the UI, because no such UI
 * exists for an RBIA engagement. `src/app/(dashboard)/audit-execution/
 * [engagementId]/page.tsx:31-34` redirects every `auditType === "RBIA"`
 * engagement to `/rbia` before line 104 renders `TeamPanel`, and `TeamPanel`
 * has exactly one import site. So a UI-created RBIA engagement is stuck at
 * PLANNED with `teamMemberCount === 0`, which `ENGAGEMENT_TRANSITIONS.PLANNED`
 * requires to be > 0. The RBIA layout still renders the "Assign Team" button
 * enabled, because its `isPrerequisiteMet()` only special-cases the meeting
 * prerequisites — the button is there and the server action rejects it. That
 * is a pre-existing product bug, filed separately; fixing it is not this
 * test's job. The fieldwork half below therefore rides `eng2` from
 * `scripts/seed-full-audit-lifecycle.ts:2218-2252` (Shivajinagar, IN_PROGRESS,
 * one AuditTeamMember, signed-off opening meeting).
 *
 * Gap 2 — the report download goes through `/api/exports/findings` rather than
 * the S3-backed `/api/download`. `generateXlsxReport` and `generatePdfReport`
 * both upload via `getObjectStore()`, and `/api/download` presigns; with no
 * object store configured (CI has never had one) both throw. Swap this step
 * for the `/api/download` path once Task 4 of this plan lands MinIO in the CI
 * compose stack.
 *
 * Gap 3 — escalation under a fake clock is not covered here. The clock is
 * faked at the job layer, not the browser layer, and
 * `src/jobs/__integration__/` already owns that; an E2E fake clock would be a
 * second mechanism for the same property.
 */

// ── Fixtures pinned by name, so a failure names the row it could not find ───

/** No seeded engagement; carries the one DRAFT RAM assessment in the seed. */
const FRESH_BRANCH = "BR012 - Wanowrie Branch";
const FRESH_BRANCH_NAME = "Wanowrie Branch";
const RAM_YEAR = "2026-27";
const AUDIT_NUMBER = "RBIA/2026-27/BR012/V1";
const OBSERVATION_TITLE = "Core cycle: housing loan income re-verification gap";

/** scripts/seed-full-audit-lifecycle.ts:2218 — IN_PROGRESS, team assigned. */
const SEEDED_ENGAGEMENT = "RBIA/2025-26/BR-003/V1";

/**
 * Radix `Select` triggers in `engagement-form.tsx` carry no `id`, and every
 * `<Label htmlFor>` there points at an id that does not exist, so these
 * comboboxes have no accessible name at all — only their `SelectValue`
 * placeholder as text content. Filtering on that text is the only handle the
 * markup offers; `getByRole("combobox", { name })` matches nothing.
 */
async function chooseOption(page: Page, placeholder: string, option: RegExp) {
  await page
    .getByRole("combobox")
    .filter({ hasText: placeholder })
    .first()
    .click();
  await page.getByRole("option", { name: option }).first().click();
}

test.describe.serial("@smoke core cycle", () => {
  let ramAssessmentUrl: string;
  let seededEngagementUrl: string;
  let observationUrl: string;

  // ── 1. Risk assessment: scored and computed by the audit manager ──────────
  test.describe.serial("as audit manager", () => {
    test.use({ storageState: "playwright/.auth/audit-manager.json" });

    test("RAM assessment is scored and computed @smoke", async ({ page }) => {
      await page.goto("/ram");
      await expect(
        page.getByRole("heading", { name: /ram assessments/i }),
      ).toBeVisible();

      // Creating the assessment is NOT driven here, because the dialog cannot
      // succeed for anyone: src/components/ram/ram-assessments-table.tsx:140-147
      // renders the year as <input type="number">, while
      // src/actions/ram/schemas.ts:5-10 requires /^\d{4}-\d{2}$/. A number
      // input cannot hold "2026-27" (the browser drops the suffix), so every
      // submission returns "Assessment year must be in format YYYY-YY". Filed
      // as a bug. The DRAFT assessment this test scores is seeded instead
      // (prisma/seed.ts, BR012 / FY2026-27); once the dialog is fixed, the
      // creation click belongs back here and the seed row can go.
      await page
        .getByRole("button", { name: new RegExp(FRESH_BRANCH_NAME) })
        .first()
        .click();

      await page.waitForURL(/\/ram\/[a-f0-9-]+/);
      ramAssessmentUrl = page.url();
      await expect(
        page.getByRole("heading", {
          name: new RegExp(`RAM Assessment — ${FRESH_BRANCH_NAME}`),
        }),
      ).toBeVisible();

      // Score every parameter on the 1-5 scale. src/components/ram/
      // ram-score-form.tsx:192-214 renders one RadioGroup per parameter, with
      // each item labelled by its own number. These clicks are local state
      // only; the single server round trip is "Save Scores".
      const scaleGroups = page.locator('[role="radiogroup"]');
      const parameterCount = await scaleGroups.count();
      expect(parameterCount).toBeGreaterThan(0);
      for (let i = 0; i < parameterCount; i++) {
        await scaleGroups.nth(i).getByRole("radio", { name: "4" }).click();
      }

      await page.getByRole("button", { name: /save scores/i }).click();

      // ram-score-form.tsx:36 — `canCompute` is derived server-side from
      // `assessment.scores.length > 0`, so the Compute button only exists
      // after the save round trip and the router.refresh() that follows it.
      const computeButton = page.getByRole("button", {
        name: /compute assessment/i,
      });
      await expect(computeButton).toBeVisible();
      await computeButton.click();

      // ram/[assessmentId]/page.tsx:51-65 — the result card only renders once
      // compositeScore is set, and the status line is the server's own word
      // for it. compute-assessment.ts:116 also writes Branch.ramScore, which
      // is what the annual plan generator schedules from.
      await expect(page.getByText(/Status: COMPUTED/)).toBeVisible();

      // The approver must be someone else (approve-assessment.ts:48), so the
      // maker has no Approve button to press.
      await expect(
        page.getByRole("button", { name: /approve assessment/i }),
      ).toBeHidden();
    });
  });

  // ── 2. The CAE approves it, generates the plan, opens the engagement ──────
  test.describe.serial("as CAE", () => {
    test.use({ storageState: "playwright/.auth/cae.json" });

    test("the CAE approves the assessment the manager computed @smoke", async ({
      page,
    }) => {
      await page.goto(ramAssessmentUrl);

      // ram/[assessmentId]/page.tsx:34 — Approve appears only at COMPUTED, and
      // only for a holder of ram:approve, which among the seeded roles is CAE
      // alone (src/lib/permissions.ts:185).
      const approveButton = page.getByRole("button", {
        name: /approve assessment/i,
      });
      await expect(approveButton).toBeVisible();
      await approveButton.click();

      // ram/[assessmentId]/page.tsx:71-76 — the ISS-022 approved banner.
      await expect(
        page.getByText(/assessment approved — ready for audit planning/i),
      ).toBeVisible();
    });

    test("annual audit plan is generated and committed @smoke", async ({
      page,
    }) => {
      await page.goto("/audit-plans");
      await expect(
        page.getByRole("heading", { name: /annual audit plans/i }),
      ).toBeVisible();

      // src/components/audit-plans/plan-generator.tsx:153-168 — a two-step
      // workflow: preview computes without writing, Commit Plan writes the
      // AuditPlan and its engagements. The Commit button does not exist until
      // a non-empty preview has come back.
      await page.getByRole("button", { name: /generate preview/i }).click();

      const commitButton = page.getByRole("button", { name: /commit plan/i });
      await expect(commitButton).toBeVisible();

      // The preview table proves the RAM-driven schedule reached the client.
      await expect(
        page.getByRole("columnheader", { name: /ram score/i }),
      ).toBeVisible();
      await expect(
        page.getByRole("cell", { name: "BR012", exact: true }),
      ).toBeVisible();

      await commitButton.click();

      // plan-generator.tsx:96 — the toast is the only client-side signal;
      // the committed plan is asserted from the server on reload below.
      await expect(page.getByText(/annual plan created!/i)).toBeVisible();

      // handleCommitPlan does not call router.refresh(), so the Existing Plans
      // table is stale until a reload. Assert the persisted row, not the DOM
      // that was already on screen.
      await page.reload();
      await expect(
        page.getByRole("cell", { name: /^FY 2026-27$/ }),
      ).toBeVisible();
    });

    test("an engagement is created and auto-selects modules from the branch profile @smoke", async ({
      page,
    }) => {
      await page.goto("/audit-execution/create");
      // `CardTitle` renders a div, not a heading element, so this is text.
      await expect(page.getByText("Create Audit Engagement")).toBeVisible();

      await chooseOption(page, "Select audit plan", /^FY 2026 - Q1_APR_JUN$/);
      await chooseOption(page, "Select branch", new RegExp(FRESH_BRANCH));
      await chooseOption(page, "Select audit area", /credit risk/i);
      await chooseOption(
        page,
        "Link to RAM assessment (optional)",
        new RegExp(`BR012.*${RAM_YEAR}`),
      );

      await page.locator("#auditNumber").fill(AUDIT_NUMBER);
      await page.locator("#visitNumber").fill("1");
      await page.locator("#periodFrom").fill("2026-04-01T09:00");
      await page.locator("#periodTo").fill("2026-09-30T18:00");
      await page.locator("#scheduledStartDate").fill("2026-10-05T09:00");
      await page.locator("#completionDate").fill("2026-10-30T18:00");
      await page
        .locator("#scopeNotes")
        .fill("E2E core cycle: full-scope RBIA of the branch.");

      await page.getByRole("button", { name: /create engagement/i }).click();

      // create-engagement.ts pushes to /audit-execution/<id>, which
      // [engagementId]/page.tsx:31-34 immediately redirects to /rbia for every
      // RBIA engagement.
      await page.waitForURL(/\/audit-execution\/[a-f0-9-]+\/rbia$/);
      await expect(
        page.getByRole("heading", {
          name: new RegExp(`RBIA Examination — ${FRESH_BRANCH_NAME}`),
        }),
      ).toBeVisible();

      // create-engagement.ts:117-134 — every AuditModule whose applicability
      // predicate matches the branch profile is selected with
      // `isAutoSelected: true`, and its statements are materialized. The
      // "Auto" badge (rbia-module-grid.tsx:206-213) is that flag's only
      // rendering, so it is the honest assertion for "auto-selected from the
      // branch profile".
      await expect(
        page.getByRole("heading", { name: /examination modules/i }),
      ).toBeVisible();
      const housingCard = page
        .locator("a[href*='/rbia/module/CRD-HLN']")
        .first();
      await expect(housingCard).toBeVisible();
      await expect(housingCard.getByText("Auto")).toBeVisible();
      await expect(housingCard.getByText(/0 \/ 23 items scored/)).toBeVisible();

      // Team assignment would come next and cannot: see Gap 1 at the top of
      // this file. The engagement stays PLANNED, and the fieldwork below runs
      // on the seeded engagement instead.
      await expect(page.getByText("Planned").first()).toBeVisible();
    });
  });

  // ── 3. Fieldwork on the seeded engagement, by the lead auditor ────────────
  // `rbia:examine` gates the module dialog, the register and every score, and
  // among the seeded roles only LEAD_AUDITOR and FIELD_AUDITOR hold it
  // (src/lib/permissions.ts) — not CAE, not AUDIT_MANAGER, not AUDITOR.
  test.describe.serial("as lead auditor", () => {
    test.use({ storageState: "playwright/.auth/lead-auditor.json" });

    test("every statement is examined on the five-point scale @smoke", async ({
      page,
    }) => {
      await page.goto("/audit-execution");

      // engagements-table.tsx:75-96 puts role="button" on the whole row, with
      // the audit number inside it, so the row's accessible name pins the
      // fixture by name rather than by position.
      await page
        .getByRole("button", { name: new RegExp(SEEDED_ENGAGEMENT) })
        .click();
      await page.waitForURL(/\/audit-execution\/[a-f0-9-]+\/rbia$/);
      seededEngagementUrl = page.url();

      // The grid is driven by the module's ExaminationNodes, not by the
      // engagement's EngagementModule rows (getEngagementModuleScores), so the
      // card is present even though the seed created this engagement without a
      // selection — and the register is reachable without adding one. The
      // Add Module dialog is therefore not on this path; auto-selection from
      // the branch profile is already asserted on the fresh engagement above.
      const moduleCard = page.locator("a[href*='/rbia/module/CRD-HLN']");
      await expect(moduleCard.getByText(/0 \/ 23 items scored/)).toBeVisible();
      await expect(moduleCard.getByText("Not started")).toBeVisible();

      // Open the register for that module.
      await page.locator("a[href*='/rbia/module/CRD-HLN']").first().click();
      await page.waitForURL(/\/rbia\/module\/CRD-HLN$/);

      // scale-tick.tsx:33-36 renders one radiogroup per statement, labelled
      // "<code>, <text>", and :41-48 one radio per point of the scale whose
      // aria-label is "<LABEL WITH SPACES>, <ratio>" — so "FULLY COMPLIANT,
      // 1.00". Each click is its own scoreStatement round trip.
      const registers = page.locator(
        ".examination-register [role='radiogroup']",
      );
      await expect(registers.first()).toBeVisible();
      const statementCount = await registers.count();
      expect(statementCount).toBe(23);

      for (let i = 0; i < statementCount; i++) {
        await registers
          .nth(i)
          .getByRole("radio", { name: /^FULLY COMPLIANT/ })
          .click();
      }

      // FULLY_COMPLIANT needs no remarks (src/lib/statement-state.ts:19-23,
      // 39-43 — remarks are only due at PARTIALLY_COMPLIANT and below), so
      // every row should read back as scored rather than "Remarks due".
      await expect(page.getByText("Remarks due")).toHaveCount(0);

      // Read the progress back from the server, not from the optimistic client
      // state that just set it — and poll, because examination-register.tsx:303
      // fires each save with `void handleScoreScale(...)`, so the click resolves
      // before the round trip does. Asserting once against a server-rendered
      // page reads whatever had committed at that instant (22/23 is the usual
      // near-miss); the progress card only re-reads the database on navigation,
      // so the retry has to include the navigation.
      await expect
        .poll(
          async () => {
            await page.goto(seededEngagementUrl);
            return page
              .locator("a[href*='/rbia/module/CRD-HLN']")
              .first()
              .innerText();
          },
          { timeout: 30_000, message: "every statement should persist" },
        )
        .toContain("23 / 23 items scored");

      await expect(
        page.locator("a[href*='/rbia/module/CRD-HLN']").first(),
      ).toContainText("Complete");
    });

    test("the exit meeting is recorded and signed off, and the engagement reaches report drafting @smoke", async ({
      page,
    }) => {
      await page.goto(`${seededEngagementUrl}/meetings`);

      // Only the Exit section is in form mode — the seeded opening meeting is
      // already signed off, so its section renders MeetingView. `#meetingDate`
      // therefore identifies the exit form unambiguously
      // (meeting-form.tsx:193-196).
      await page.locator("#meetingDate").fill("2026-02-20");

      // meeting-form.tsx:137-140 rejects a submission with no attendees. The
      // list is built from the engagement's team (meeting-form.tsx:251-281),
      // and the seed assigns Amit Joshi as its lead auditor.
      await page.getByRole("button", { name: /Amit Joshi/ }).click();
      await page
        .locator("#minutesText")
        .fill(
          "Agenda Items: examination findings walkthrough.\nDecisions Taken: no unresolved disputes.\nAction Items: none outstanding.\nNext Steps: report drafting.",
        );
      await page
        .locator("#keyDiscussionPoints")
        .fill("Housing loan module examined in full; no adverse observations.");
      await page.getByRole("button", { name: /record meeting/i }).click();
      await expect(page.getByText(/meeting recorded/i)).toBeVisible();

      // meeting-view.tsx:196-212 — sign-off is what the state machine's
      // EXIT_MEETING -> REPORT_DRAFT prerequisite actually reads
      // (engagement-state-machine.ts:143-151).
      await page.getByRole("button", { name: /^sign off$/i }).click();
      await expect(page.getByText(/meeting signed off/i)).toBeVisible();
      await expect(page.getByText("Signed Off").last()).toBeVisible();

      // Recording the meeting advanced the status by itself: meetings.ts:90-125
      // drives IN_PROGRESS -> EXIT_MEETING as part of the same transaction, so
      // there is no separate "Record Exit Meeting" click. The RBIA layout
      // renders exactly one transition button, labelled from
      // ENGAGEMENT_TRANSITIONS (layout.tsx:29-35), and it now offers the next
      // edge — which is itself the assertion that the status moved.
      await expect(
        page.getByRole("button", { name: /^record exit meeting$/i }),
      ).toBeHidden();

      await page
        .getByRole("button", { name: /^begin report drafting$/i })
        .click();
      await expect(
        page.getByText(/status updated to report draft/i),
      ).toBeVisible();
    });
  });

  // ── 4. Score freeze and completion, which only the CAE may do ─────────────
  test.describe.serial("as CAE, closing the engagement", () => {
    test.use({ storageState: "playwright/.auth/cae.json" });

    test("the RBIA score is frozen and the engagement completed @smoke", async ({
      page,
    }) => {
      await page.goto(seededEngagementUrl);

      // rbia-score-panel.tsx:43 — the button only exists at REPORT_DRAFT or
      // COMPLETED, and :129 only enables it once every module has a score.
      // `rbia:score_freeze` is held by CAE and AUDIT_MANAGER, not LEAD_AUDITOR,
      // which is why this half runs as a different user.
      const freezeButton = page.getByRole("button", { name: /freeze score/i });
      await expect(freezeButton).toBeEnabled();
      await freezeButton.click();

      // The confirmation is an AlertDialog; its action button is the one that
      // actually calls freezeRbiaScore.
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: /freeze/i })
        .click();
      await expect(page.getByText(/score frozen:/i)).toBeVisible();

      // Frozen means frozen: the button is gone, not merely disabled
      // (rbia-score-panel.tsx:158 — `!isFrozen`).
      await expect(
        page.getByRole("button", { name: /freeze score/i }),
      ).toBeHidden();

      // REPORT_DRAFT -> COMPLETED is CAE-only and requires the frozen score
      // (engagement-state-machine.ts:159-172) — the step this whole fieldwork
      // sequence exists to reach.
      await page
        .getByRole("button", { name: /^complete engagement$/i })
        .click();
      await expect(
        page.getByText(/status updated to completed/i),
      ).toBeVisible();

      // COMPLETED is terminal, so the layout renders no transition button at
      // all (ENGAGEMENT_TRANSITIONS.COMPLETED is empty).
      await page.reload();
      await expect(
        page.getByRole("button", { name: /^complete engagement$/i }),
      ).toBeHidden();
    });
  });

  // ── 5. An observation through maker-checker to ISSUED, and answered ───────
  // Each transition's allowed roles come from src/lib/state-machine.ts:68-100:
  // DRAFT -> SUBMITTED by the author, SUBMITTED -> REVIEWED -> ISSUED by an
  // AUDIT_MANAGER, ISSUED -> RESPONSE by the AUDITEE. Three different people
  // is the point — that is what makes it maker-checker rather than a workflow.
  test.describe.serial("an observation through maker-checker", () => {
    test.use({ storageState: "playwright/.auth/auditor.json" });

    test("the auditor raises it and submits it for review @smoke", async ({
      page,
    }) => {
      await page.goto("/findings/new");

      // observation-form.tsx:156-191 — the three required free-text fields.
      await page.locator("#title").fill(OBSERVATION_TITLE);
      await page
        .locator("#description")
        .fill(
          "Housing loan files sampled in the audit period carried no evidence of periodic income re-verification, against the bank's own credit policy, because the annual review step was never scheduled. Elevated credit risk on the housing book.",
        );
      await page
        .locator("#recommendation")
        .fill("Schedule and evidence an annual income re-verification review.");

      // Unlike engagement-form.tsx, every Select here has an explicit
      // SelectTrigger id (:210, :225, :241, :261, :281).
      await page.locator("#severity").click();
      await page.getByRole("option", { name: "High", exact: true }).click();
      await page.locator("#moduleId").click();
      await page.getByRole("option", { name: /housing loans/i }).click();
      await page.locator("#pertainsTo").click();
      await page.getByRole("option", { name: "Finance", exact: true }).click();
      await page.locator("#branchId").click();
      await page
        .getByRole("option", { name: FRESH_BRANCH_NAME, exact: true })
        .click();

      await page.getByRole("button", { name: /create observation/i }).click();
      await page.waitForURL(/\/findings\/[a-f0-9-]+/);
      observationUrl = page.url();

      // observation-actions.tsx:207 — every transition needs a comment.
      await page.getByRole("button", { name: /submit for review/i }).click();
      await page
        .getByPlaceholder(/reason for this transition/i)
        .fill("Fieldwork complete; submitting for manager review.");
      await page.getByRole("button", { name: /^confirm$/i }).click();
      await expect(page.getByText(/submitted/i).first()).toBeVisible();
    });

    test("the manager reviews and issues it to the branch @smoke", async ({
      browser,
    }) => {
      // SUBMITTED -> REVIEWED -> ISSUED is AUDIT_MANAGER-only, and the author
      // above is an AUDITOR, so this genuinely is a second pair of eyes.
      const context = await browser.newContext({
        storageState: "playwright/.auth/manager.json",
      });
      const page = await context.newPage();
      await page.goto(observationUrl);

      await page.getByRole("button", { name: /^approve$/i }).click();
      await page
        .getByPlaceholder(/reason for this transition/i)
        .fill("Reviewed against the sampled files; approved for issuance.");
      await page.getByRole("button", { name: /^confirm$/i }).click();
      await expect(page.getByText(/reviewed/i).first()).toBeVisible();

      await page.getByRole("button", { name: /issue to auditee/i }).click();
      await page
        .getByPlaceholder(/reason for this transition/i)
        .fill("Issued to the branch manager for response.");
      await page.getByRole("button", { name: /^confirm$/i }).click();
      await expect(page.getByText(/issued/i).first()).toBeVisible();

      await context.close();
    });

    test("the branch responds to it @smoke", async ({ browser }) => {
      const context = await browser.newContext({
        storageState: "playwright/.auth/auditee.json",
      });
      const page = await context.newPage();
      await page.goto(observationUrl);

      await page
        .getByRole("button", { name: /respond to observation/i })
        .click();
      await page
        .getByPlaceholder(/reason for this transition/i)
        .fill("Corrective action taken; review calendar now in place.");
      // observation-actions.tsx:214-235 — the RESPONSE transition adds the
      // branch's own response and action plan to the same dialog.
      await page
        .locator("#auditee-response")
        .fill(
          "Annual income re-verification has been scheduled for all files.",
        );
      await page.getByRole("button", { name: /^confirm$/i }).click();

      // The auditee has no onward transition from RESPONSE, so the control it
      // just used must be gone — the state actually moved.
      await expect(
        page.getByRole("button", { name: /respond to observation/i }),
      ).toBeHidden();

      await context.close();
    });
  });

  // ── 6. The report comes out of the platform as a file ────────────────────
  test.describe("the report is downloaded", () => {
    test.use({ storageState: "playwright/.auth/cae.json" });

    test("an xlsx report downloads through the browser @smoke", async ({
      page,
    }) => {
      await page.goto("/findings");

      // findings/page.tsx:77 — <a href="/api/exports/findings" download>. The
      // route streams the workbook with Content-Disposition: attachment
      // (api/exports/findings/route.ts:72-77), so this is a real browser
      // download, not an assertion about a link's href. See Gap 2 above for
      // why this stands in for the S3-backed /api/download path.
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("link", { name: /export/i }).click();
      const download = await downloadPromise;

      expect(download.suggestedFilename()).toMatch(
        /^findings-export-.*\.xlsx$/,
      );

      // The event alone would also fire for a zero-byte or error-page
      // download, so check what the route actually serves.
      const response = await page.request.get("/api/exports/findings");
      expect(response.status()).toBe(200);
      expect(response.headers()["content-type"]).toContain("spreadsheetml");
      const body = await response.body();
      expect(body.byteLength).toBeGreaterThan(1000);
      // The workbook's bytes are all present, so the zip's end-of-central-
      // directory record must be somewhere in them. It should be at the END —
      // see the test below for why this only checks that it exists.
      expect(body.indexOf(Buffer.from("PK\x05\x06"))).toBeGreaterThan(-1);
    });

    // Expected to fail: `/api/exports/findings` serves a *rotated* workbook —
    // every byte is present and the length is right, but the file starts part
    // way through the zip, so `unzip` reports "extra bytes at beginning" and
    // Excel cannot open it. Reproduced against `pnpm build && pnpm start`, not
    // just dev, and it affects every route that goes through
    // `toBuffer()` in src/lib/excel-export.ts:253-261, which converts the Node
    // Buffer from `writeBuffer()` to an ArrayBuffer by taking `.buffer` and
    // dropping `byteOffset`/`byteLength`. Filed as a bug; this test is the
    // regression guard, and when the fix lands Playwright will report it as an
    // unexpected pass so this marker gets removed.
    test("the downloaded workbook is a valid zip", async ({ page }) => {
      test.fail();
      const response = await page.request.get("/api/exports/findings");
      const body = await response.body();
      expect(body.subarray(0, 2).toString("latin1")).toBe("PK");
    });
  });
});
