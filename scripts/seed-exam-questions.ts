/**
 * seed-exam-questions.ts
 * ---------------------------------------------------------------------------
 * Standalone seed script that upserts Housing Loans examination questions
 * into the ExaminationQuestion table for sample-based account examination.
 *
 * Module: CRD-HLN (Housing Loans)
 * Questions: 25 questions across 7 categories
 *
 * Architecture: Each credit module gets its own question set identified by
 * moduleCode. The same pattern can be applied for Gold Loans (CRD-GLD),
 * Vehicle Loans (CRD-VHL), or any other credit module by changing the
 * moduleCode and question definitions.
 *
 * RBI Reference Style: General regulation area names only — not specific
 * circular numbers (e.g. "Master Direction on Housing Finance", not
 * "RBI/2024-25/DoR.CRE.REC.123"). This is more maintainable as circular
 * numbers change with each revision.
 *
 * Usage
 *   pnpm seed:exam-questions [--tenant-id=<uuid>]
 *   pnpm tsx scripts/seed-exam-questions.ts [--tenant-id=<uuid>]
 *
 * Idempotent: uses upsert on @@unique([tenantId, moduleCode, text]).
 * Re-running updates metadata (rbiReference, bestPracticeTip, weight, etc.)
 * but does not create duplicate questions.
 * ---------------------------------------------------------------------------
 */

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

/* ------------------------------------------------------------------ */
/*  Bootstrap Prisma with pg.Pool for proper cleanup                  */
/* ------------------------------------------------------------------ */
const connectionString = process.env.DATABASE_URL!;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

/* ------------------------------------------------------------------ */
/*  Resolve tenant                                                    */
/* ------------------------------------------------------------------ */
async function resolveTenantId(): Promise<string> {
  const flag = process.argv.find((a) => a.startsWith("--tenant-id="));
  if (flag) {
    const id = flag.split("=")[1];
    console.log(`Using provided tenant: ${id}`);
    return id;
  }

  const tenant = await prisma.tenant.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!tenant) throw new Error("No tenant found. Pass --tenant-id=<uuid>.");
  console.log(`Using tenant: ${tenant.name} (${tenant.id})`);
  return tenant.id;
}

/* ------------------------------------------------------------------ */
/*  Question definitions                                               */
/* ------------------------------------------------------------------ */

interface QuestionDef {
  moduleCode: string;
  text: string;
  rbiReference: string | null;
  bestPracticeTip: string | null;
  category: string;
  weight: number;
  isCritical: boolean;
  displayOrder: number;
}

/**
 * Housing Loans examination questions (moduleCode: CRD-HLN)
 *
 * Categories:
 *   1. Documentation             (5 questions)
 *   2. Collateral & Valuation    (4 questions)
 *   3. Sanction & Appraisal      (4 questions)
 *   4. Disbursement              (3 questions)
 *   5. PSL & Regulatory          (4 questions) — CRITICAL questions
 *   6. NPA & Provisioning        (3 questions) — CRITICAL questions
 *   7. Monitoring & Recovery     (2 questions)
 */
const HOUSING_LOAN_QUESTIONS: QuestionDef[] = [
  // ── 1. Documentation (displayOrder 1-5) ────────────────────────────────

  {
    moduleCode: "CRD-HLN",
    category: "Documentation",
    displayOrder: 1,
    text: "Is the loan application complete with all required KYC documents (Aadhaar, PAN, address proof), income proof, and property documents on file?",
    rbiReference: "Master Direction on KYC",
    bestPracticeTip:
      "Cross-verify name, address, and signature across all KYC documents — mismatches are the most common application deficiency. Ensure Aadhaar and PAN are linked and NSDL/UIDAI verification is documented.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Documentation",
    displayOrder: 2,
    text: "Has the sanction letter been issued to the borrower with all mandatory terms including loan amount, tenure, interest rate, repayment schedule, security details, pre-payment charges, and conditions precedent?",
    rbiReference: "Master Direction on Housing Finance",
    bestPracticeTip:
      "Verify that the borrower and all co-borrowers have signed acceptance of the sanction letter before disbursement — unsigned sanction letters are a common audit finding.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Documentation",
    displayOrder: 3,
    text: "Is CERSAI registration completed within 30 days of mortgage creation for the housing loan?",
    rbiReference: "Master Direction on Housing Finance",
    bestPracticeTip:
      "Check CERSAI registration within 30 days of mortgage creation — delayed registration is a common compliance gap. Generate a report of accounts where mortgage date to CERSAI registration date exceeds 30 days.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Documentation",
    displayOrder: 4,
    text: "Has a title search and legal opinion covering at least 30 years of ownership chain been obtained before sanction, confirming clear and marketable title free from encumbrances and litigation?",
    rbiReference: "Master Direction on Housing Finance",
    bestPracticeTip:
      "Verify legal opinion covers government acquisition proceedings and that approved building plan, commencement and completion certificates, and occupancy certificate are included in the file.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Documentation",
    displayOrder: 5,
    text: "Has the loan agreement been executed on proper stamp paper before or at the time of first disbursement, with all original title deeds in the bank's custody and acknowledged in the document checklist?",
    rbiReference: "Master Direction on Housing Finance",
    bestPracticeTip:
      "Verify bank's charge is noted on property records (7/12 extract or city survey) and that MODT/registered mortgage is completed where required. Document deficiency register should be nil or within tolerance.",
    weight: 1.0,
    isCritical: false,
  },

  // ── 2. Collateral & Valuation (displayOrder 1-4) ───────────────────────

  {
    moduleCode: "CRD-HLN",
    category: "Collateral & Valuation",
    displayOrder: 1,
    text: "Was the property valuation conducted by a bank-empanelled valuer, and is the valuation report within the policy-prescribed validity period?",
    rbiReference: "Master Direction on Housing Finance",
    bestPracticeTip:
      "Verify the valuer is on the current approved panel — expired empanelments are common. Check that the valuation date is within 6 months of sanction for completed properties.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Collateral & Valuation",
    displayOrder: 2,
    text: "Is the loan-to-value (LTV) ratio within RBI-prescribed limits — up to 90% for loans up to Rs. 30 lakh, 80% for Rs. 30-75 lakh, and 75% for loans above Rs. 75 lakh — using the lower of market value and guideline value?",
    rbiReference: "Master Direction on Housing Finance",
    bestPracticeTip:
      "Confirm LTV is calculated using the lower of market value and guideline/ready-reckoner value, not the higher. Verify risk weight assignment corresponds to the LTV band for capital adequacy computation.",
    weight: 1.5,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Collateral & Valuation",
    displayOrder: 3,
    text: "Is property insurance coverage (covering full reinstatement value with the bank as loss-payee) in place and current, along with life insurance or PMJJBY coverage for the borrower as per policy?",
    rbiReference: null,
    bestPracticeTip:
      "Check that insurance renewal premiums are debited to the loan account on time and renewal policies are taken on record before expiry. Expired insurance policies are a frequently cited audit deficiency.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Collateral & Valuation",
    displayOrder: 4,
    text: "Has periodic re-valuation of the mortgaged property been conducted at the frequency prescribed by policy (at least once in three years)?",
    rbiReference: null,
    bestPracticeTip:
      "Flag accounts where the last valuation date exceeds the policy-mandated frequency. Verify the updated LTV post-revaluation is within prescribed limits and that action was taken for accounts breaching LTV norms.",
    weight: 1.0,
    isCritical: false,
  },

  // ── 3. Sanction & Appraisal (displayOrder 1-4) ─────────────────────────

  {
    moduleCode: "CRD-HLN",
    category: "Sanction & Appraisal",
    displayOrder: 1,
    text: "Has the borrower's repayment capacity been assessed with EMI/NMI ratio within policy limits, based on audited financials, ITR, and banking statements for the last 12 months?",
    rbiReference: null,
    bestPracticeTip:
      "Verify EMI/NMI ratio does not exceed 50% including all existing obligations from the credit bureau report. For self-employed borrowers, cash profit from audited P&L — not turnover — should be the basis.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Sanction & Appraisal",
    displayOrder: 2,
    text: "Has a credit bureau report (CIBIL/Equifax) been obtained and evaluated for all applicants, co-applicants, and guarantors, with credit score meeting policy threshold and no undisclosed overdue accounts?",
    rbiReference: null,
    bestPracticeTip:
      "Verify all existing loan facilities appearing in CIBIL are disclosed in the borrowing details. Flag recent inquiries and newly availed or rejected loans in the last 6 months as potential early warning signals.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Sanction & Appraisal",
    displayOrder: 3,
    text: "Was the loan sanctioned by the competent authority within the Board-approved delegation of powers, with committee-level approval (with signed minutes) for loans at or above the applicable threshold?",
    rbiReference: null,
    bestPracticeTip:
      "Verify no single official sanctioned beyond their delegated limit and the four-eyes (maker-checker) principle is applied. Deviation approvals for ITR gaps or collateral shortfalls must come from the next-higher authority.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Sanction & Appraisal",
    displayOrder: 4,
    text: "Was a pre-sanction site visit/inspection of the property conducted and documented before sanction?",
    rbiReference: null,
    bestPracticeTip:
      "Verify the pre-sanction inspection report includes photographs, inspector name and designation, visit date, and observation on property condition and construction stage. Missing inspections are a common gap.",
    weight: 1.0,
    isCritical: false,
  },

  // ── 4. Disbursement (displayOrder 1-3) ─────────────────────────────────

  {
    moduleCode: "CRD-HLN",
    category: "Disbursement",
    displayOrder: 1,
    text: "For under-construction properties, are disbursements released in stages linked to certified construction progress, with physical verification by a bank official or empanelled engineer before each tranche?",
    rbiReference: null,
    bestPracticeTip:
      "Confirm construction progress photographs and engineer/architect certificates are in the file at each stage. Disbursement ahead of construction stage is a serious control failure — verify builder receipts match disbursed amounts.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Disbursement",
    displayOrder: 2,
    text: "Has end-use verification been completed within the prescribed timeframe after final disbursement, with end-use certificate on file?",
    rbiReference: null,
    bestPracticeTip:
      "Check that end-use certificate is obtained within 90 days of each tranche for construction loans. Verify funds were credited to the builder/seller directly — routing through borrower's personal account without justification is a red flag.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Disbursement",
    displayOrder: 3,
    text: "Was no disbursement released before mortgage creation, and are all conditions precedent in the sanction letter (insurance, PDC/ECS/NACH mandate, guarantees) fulfilled before first disbursement?",
    rbiReference: "Master Direction on Housing Finance",
    bestPracticeTip:
      "Verify the disbursement checklist is signed off by the designated officer with no outstanding critical conditions. Pre-disbursement condition compliance is the most critical control in the disbursement stage.",
    weight: 1.5,
    isCritical: false,
  },

  // ── 5. PSL & Regulatory (displayOrder 1-4) — CRITICAL ─────────────────

  {
    moduleCode: "CRD-HLN",
    category: "PSL & Regulatory",
    displayOrder: 1,
    text: "Is the housing loan correctly classified under Priority Sector Lending per RBI guidelines — loans up to Rs. 35 lakh (metropolitan) / Rs. 25 lakh (non-metropolitan) for dwellings valued up to Rs. 45 lakh / Rs. 30 lakh?",
    rbiReference: "Master Direction on PSL",
    bestPracticeTip:
      "Verify PSL classification is reviewed at sanction and annually — misclassified loans must be corrected before PSL reporting dates. Cross-check the city classification (metro vs. non-metro) used for the limit eligibility.",
    weight: 2.0,
    isCritical: true,
  },
  {
    moduleCode: "CRD-HLN",
    category: "PSL & Regulatory",
    displayOrder: 2,
    text: "If classified under PSL for EWS/LIG/MIG categories (PMAY), is the borrower's income category correctly identified and documented, with CLSS subsidy claims submitted to NHB/HUDCO within prescribed timelines?",
    rbiReference: "Master Direction on PSL",
    bestPracticeTip:
      "Ensure Aadhaar-linked DBT verification is completed and documented for PMAY-CLSS accounts. Duplicate subsidy claims must be prevented through CLSS-Awas Portal verification before submission.",
    weight: 1.5,
    isCritical: true,
  },
  {
    moduleCode: "CRD-HLN",
    category: "PSL & Regulatory",
    displayOrder: 3,
    text: "Is the interest rate applied linked to the Board-approved benchmark (EBLR/MCLR/PLR) and within the approved pricing grid based on credit score, LTV, and loan amount, with rate reset methodology disclosed in the loan agreement?",
    rbiReference: "Master Direction on Interest Rate on Advances",
    bestPracticeTip:
      "Verify the rate of interest is correctly entered in the CBS system and interest failure reports are generated and reviewed with no unexplained entries. No prepayment penalty should be charged on floating-rate housing loans.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "PSL & Regulatory",
    displayOrder: 4,
    text: "Are all statutory returns related to housing loans filed within prescribed timelines — CRILC reporting for SMA-2/NPA accounts, NHB quarterly returns, RBI DSB returns on PSL compliance, and CERSAI registration within 30 days?",
    rbiReference: "Master Direction on Housing Finance",
    bestPracticeTip:
      "Maintain the audit trail of return submissions with acknowledgement receipts. RBI inspection observations on the housing loan portfolio must be tracked in the compliance monitoring system with closure evidence.",
    weight: 1.0,
    isCritical: false,
  },

  // ── 6. NPA & Provisioning (displayOrder 1-3) — CRITICAL ────────────────

  {
    moduleCode: "CRD-HLN",
    category: "NPA & Provisioning",
    displayOrder: 1,
    text: "Is NPA classification timely per RBI IRAC norms — accounts classified as NPA after 90 days past due without manual override — and is the CBS-driven NPA flag not suppressed without authorized approval?",
    rbiReference:
      "Master Circular on Income Recognition and Asset Classification",
    bestPracticeTip:
      "Cross-check DPD calculation with system-generated reports — manual overrides often mask true delinquency. NPA upgradation must be only on full clearance of arrears; verify no evergreening through restructuring.",
    weight: 2.0,
    isCritical: true,
  },
  {
    moduleCode: "CRD-HLN",
    category: "NPA & Provisioning",
    displayOrder: 2,
    text: "Is provisioning held as per RBI IRAC norms — 15% for sub-standard, 25-40% for doubtful (age-based), and 100% for loss assets — with correct asset classification applied?",
    rbiReference:
      "Master Circular on Income Recognition and Asset Classification",
    bestPracticeTip:
      "Verify provisioning computation includes both principal and interest. Check that upgrades from doubtful to sub-standard on partial repayment are not made — full clearance of arrears is required for upgradation.",
    weight: 1.5,
    isCritical: true,
  },
  {
    moduleCode: "CRD-HLN",
    category: "NPA & Provisioning",
    displayOrder: 3,
    text: "Is any restructuring or rescheduling of housing loan properly documented, classified as per the applicable restructuring framework, and recovery efforts documented with timeline and escalation history?",
    rbiReference:
      "Master Circular on Income Recognition and Asset Classification",
    bestPracticeTip:
      "Verify restructured accounts are flagged separately in MIS and not prematurely upgraded. Recovery notices, demand letters, and SARFAESI proceedings must be documented with timestamps and proper authority approvals.",
    weight: 1.0,
    isCritical: false,
  },

  // ── 7. Monitoring & Recovery (displayOrder 1-2) ────────────────────────

  {
    moduleCode: "CRD-HLN",
    category: "Monitoring & Recovery",
    displayOrder: 1,
    text: "Is SMA (Special Mention Account) classification generated by CBS automatically based on DPD — SMA-0 (1-30 days), SMA-1 (31-60 days), SMA-2 (61-90 days) — with SMA-2 accounts reported to CRILC within prescribed timelines?",
    rbiReference: "RBI Prudential Framework for Resolution of Stressed Assets",
    bestPracticeTip:
      "Verify SMA classification is system-driven and not manually adjusted. SMA-2 accounts must trigger proactive outreach within 30 days of default; document evidence of early warning signal monitoring and resolution plan initiation.",
    weight: 1.0,
    isCritical: false,
  },
  {
    moduleCode: "CRD-HLN",
    category: "Monitoring & Recovery",
    displayOrder: 2,
    text: "Is the borrower's account reviewed at least annually with updated income assessment, EMI collection tracked through NACH/ECS with bounce instances documented, and early warning signals (job loss, CIBIL drop, frequent EMI bounces) monitored and escalated?",
    rbiReference: null,
    bestPracticeTip:
      "Check that overdue accounts are followed up per the collection policy with documented call logs, notices, and visit reports. Confirm no debits for other ECS/payments are allowed from operative accounts when term loan overdues exist.",
    weight: 1.0,
    isCritical: false,
  },
];

/* ------------------------------------------------------------------ */
/*  Main upsert logic                                                 */
/* ------------------------------------------------------------------ */
async function main() {
  const tenantId = await resolveTenantId();

  console.log("\nUpserting ExaminationQuestion records ...\n");

  let upsertCount = 0;
  const categoryCount: Record<string, number> = {};

  for (const q of HOUSING_LOAN_QUESTIONS) {
    await prisma.examinationQuestion.upsert({
      where: {
        tenantId_moduleCode_text: {
          tenantId,
          moduleCode: q.moduleCode,
          text: q.text,
        },
      },
      create: {
        tenantId,
        moduleCode: q.moduleCode,
        text: q.text,
        rbiReference: q.rbiReference,
        bestPracticeTip: q.bestPracticeTip,
        category: q.category,
        weight: q.weight,
        isCritical: q.isCritical,
        displayOrder: q.displayOrder,
        isActive: true,
      },
      update: {
        rbiReference: q.rbiReference,
        bestPracticeTip: q.bestPracticeTip,
        category: q.category,
        weight: q.weight,
        isCritical: q.isCritical,
        displayOrder: q.displayOrder,
        isActive: true,
      },
    });

    upsertCount++;
    categoryCount[q.category] = (categoryCount[q.category] ?? 0) + 1;
  }

  /* ---------------------------------------------------------------- */
  /*  Summary table                                                   */
  /* ---------------------------------------------------------------- */
  console.log("Upsert complete.\n");
  console.log(
    "+----------------------------------------------------+-------+----------+",
  );
  console.log(
    "| Category                                           | Count | Critical |",
  );
  console.log(
    "+----------------------------------------------------+-------+----------+",
  );

  const categories = Object.keys(categoryCount).sort();
  for (const cat of categories) {
    const criticalInCat = HOUSING_LOAN_QUESTIONS.filter(
      (q) => q.category === cat && q.isCritical,
    ).length;
    console.log(
      `| ${cat.padEnd(50)} |   ${String(categoryCount[cat]).padStart(2)}  |    ${String(criticalInCat).padStart(2)}    |`,
    );
  }

  console.log(
    "+----------------------------------------------------+-------+----------+",
  );
  const totalCritical = HOUSING_LOAN_QUESTIONS.filter(
    (q) => q.isCritical,
  ).length;
  console.log(
    `| Total                                              |   ${String(upsertCount).padStart(2)}  |    ${String(totalCritical).padStart(2)}    |`,
  );
  console.log(
    "+----------------------------------------------------+-------+----------+",
  );

  // Weight range summary
  const weights = HOUSING_LOAN_QUESTIONS.map((q) => q.weight);
  const minWeight = Math.min(...weights);
  const maxWeight = Math.max(...weights);
  const avgWeight = weights.reduce((s, w) => s + w, 0) / weights.length;

  console.log("\nWeight distribution:");
  console.log(`  Min: ${minWeight.toFixed(1)}`);
  console.log(`  Max: ${maxWeight.toFixed(1)}`);
  console.log(`  Avg: ${avgWeight.toFixed(2)}`);

  // Critical items
  const criticalItems = HOUSING_LOAN_QUESTIONS.filter((q) => q.isCritical);
  console.log(`\nCritical questions (${criticalItems.length}):`);
  for (const ci of criticalItems) {
    console.log(`   [${ci.category}] ${ci.text.slice(0, 80)}...`);
  }

  // Architecture note
  console.log("\nArchitecture note:");
  console.log(
    "  To add questions for another module (e.g. Gold Loans CRD-GLD),",
  );
  console.log(
    "  create a new question array with moduleCode: 'CRD-GLD' and run",
  );
  console.log("  this script with the new definitions.\n");

  console.log("Done.\n");
}

/* ------------------------------------------------------------------ */
/*  Execute with proper cleanup                                       */
/* ------------------------------------------------------------------ */
main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
