/**
 * seed-rbia-housing.ts
 * ---------------------------------------------------------------------------
 * Standalone seed script that upserts 31 ExaminationNode records forming a
 * complete Housing-Loans examination tree for RBIA v6.0.
 *
 * Hierarchy
 *   depth 0  CRD                          (root - Credit Risk)
 *   depth 1  CRD-HLN                      (module - Housing Loans)
 *   depth 2  CRD-HLN-{PRE|DOC|SAN|DIS|MON|REG}  (6 sub-modules)
 *   depth 3  23 leaf items                 (auditor-evaluated value statements)
 *
 * Usage
 *   pnpm tsx scripts/seed-rbia-housing.ts [--tenant-id=<uuid>]
 *
 * Idempotent: uses upsert on @@unique([tenantId, code]).
 * Structural fields (depth, isLeaf, parentId) are NOT updated on re-run.
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
/*  Node definitions (parent-first order)                             */
/* ------------------------------------------------------------------ */

interface NodeDef {
  code: string;
  name: string;
  depth: number;
  isLeaf: boolean;
  parentCode: string | null;
  weight: number;
  isCritical: boolean;
  riskCategory: string | null;
  regulatoryRef: string | null;
  description: string | null;
}

const NODES: NodeDef[] = [
  // ── depth 0: root ──────────────────────────────────────────────
  {
    code: "CRD",
    name: "Credit Risk",
    depth: 0,
    isLeaf: false,
    parentCode: null,
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description: null,
  },

  // ── depth 1: module ────────────────────────────────────────────
  {
    code: "CRD-HLN",
    name: "Housing Loans",
    depth: 1,
    isLeaf: false,
    parentCode: "CRD",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: "RBI/2024-25/DoR.CRE.REC",
    description: null,
  },

  // ── depth 2: sub-modules ───────────────────────────────────────
  {
    code: "CRD-HLN-PRE",
    name: "Pre-Sanction Checks",
    depth: 2,
    isLeaf: false,
    parentCode: "CRD-HLN",
    weight: 0.2,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description: null,
  },
  {
    code: "CRD-HLN-DOC",
    name: "Documentation",
    depth: 2,
    isLeaf: false,
    parentCode: "CRD-HLN",
    weight: 0.2,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description: null,
  },
  {
    code: "CRD-HLN-SAN",
    name: "Sanction & Approval",
    depth: 2,
    isLeaf: false,
    parentCode: "CRD-HLN",
    weight: 0.2,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description: null,
  },
  {
    code: "CRD-HLN-DIS",
    name: "Disbursement Controls",
    depth: 2,
    isLeaf: false,
    parentCode: "CRD-HLN",
    weight: 0.15,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description: null,
  },
  {
    code: "CRD-HLN-MON",
    name: "Post-Disbursement Monitoring",
    depth: 2,
    isLeaf: false,
    parentCode: "CRD-HLN",
    weight: 0.15,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description: null,
  },
  {
    code: "CRD-HLN-REG",
    name: "Regulatory Compliance",
    depth: 2,
    isLeaf: false,
    parentCode: "CRD-HLN",
    weight: 0.1,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description: null,
  },

  // ── depth 3: Pre-Sanction leaf items ───────────────────────────

  {
    code: "CRD-HLN-PRE-001",
    name: "Borrower Eligibility & KYC Verification",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-PRE",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that borrower eligibility criteria are applied as per policy including age, " +
      "income, employment/business vintage, and residency. Confirm KYC documents (Aadhaar, " +
      "PAN, address proof) are valid, mutually consistent, and that application form details " +
      "match KYC records with no name, address, or signature mismatches. Ensure internal " +
      "dedupe checks and negative-list screening (RBI Fraud List, Indian Kanoon, NCTL) are " +
      "completed before appraisal. At branch level, verify that membership formalities are " +
      "completed for loan disbursements above Rs. 1 lakh and that the branch maintains the " +
      "loan sanctioned-and-disbursed register for the inspection period.",
  },
  {
    code: "CRD-HLN-PRE-002",
    name: "Income & Repayment Capacity Assessment",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-PRE",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that income assessment is based on audited financials, ITR (filed within due " +
      "date with valid UDIN), and banking statements for last 12 months. Confirm FOIR/EMI-NII " +
      "ratio is within policy limits. For salaried borrowers, validate salary slips, Form 16, " +
      "and employer confirmation. For self-employed, ascertain cash profit from P&L, verify " +
      "top-line growth is backed by GST returns and banking turnover, and assess interest " +
      "paying capacity based on PBDIT. At branch level, verify EITR status through authorized " +
      "agency (confirm no 'Processed with Demand Due' status), check that deviation approvals " +
      "for ITR gaps are taken from appropriate authority, and ensure projected sales targets " +
      "mentioned in sanction are monitored against actual GST returns.",
  },
  {
    code: "CRD-HLN-PRE-003",
    name: "Property Valuation & Legal Title Verification",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-PRE",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Confirm that property valuation is conducted by bank-empanelled valuers and that the " +
      "valuation report is not older than the policy-prescribed period. Verify legal title " +
      "search report covers at least 30 years of ownership chain, confirms clear and " +
      "marketable title, and that the property is free from encumbrances, litigation, and " +
      "government acquisition proceedings. Ensure approved building plan, commencement and " +
      "completion certificates, and occupancy certificate are documented.",
  },
  {
    code: "CRD-HLN-PRE-004",
    name: "CIBIL / Credit Bureau Verification",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-PRE",
    weight: 1.0,
    isCritical: true,
    riskCategory: "Credit Risk",
    regulatoryRef: "RBI/2024-25/DoR.CRE.REC",
    description:
      "Verify CIBIL / credit bureau reports are pulled for all applicants, co-applicants, " +
      "guarantors, and related entities (firms, sister concerns). Confirm credit score meets " +
      "policy threshold and that report is within validity period. Check for any overdue, DPD, " +
      "SMA, DBT, LSS, or written-off accounts. Validate that all existing loan facilities " +
      "appearing in CIBIL are disclosed in the borrowing details and that EMI repayment " +
      "regularity is verified from banking statements. Flag recent inquiries and newly " +
      "availed/rejected loans in the last 6 months.",
  },

  // ── depth 3: Documentation leaf items ──────────────────────────

  {
    code: "CRD-HLN-DOC-001",
    name: "Loan Agreement & Charge Creation",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-DOC",
    weight: 1.0,
    isCritical: true,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that the loan agreement is executed on proper stamp paper of adequate value " +
      "before or at the time of first disbursement. Confirm that mortgage is registered with " +
      "the Sub-Registrar within the prescribed timeline (equitable or registered as per policy). " +
      "Ensure CERSAI registration is completed within 30 days of charge creation. Validate " +
      "that all original title deeds are in the bank's custody and acknowledged in the " +
      "document checklist. At branch level, confirm bank's charge is noted on property " +
      "records (7/12 extract or city survey), verify that the branch has prepared a proper " +
      "disbursement docket covering all terms and conditions from the sanction letter, and " +
      "ensure tenant declaration is obtained on record where property is tenanted.",
  },
  {
    code: "CRD-HLN-DOC-002",
    name: "Insurance & Guarantee Documentation",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-DOC",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that property insurance covers the full reinstatement value with the bank as " +
      "loss-payee / first mortgagee, and that the policy is current and not expired. Confirm " +
      "life insurance / PMJJBY coverage for the borrower is in place as per policy. Where " +
      "guarantors are obtained, validate guarantee deed execution, guarantor KYC, and CIBIL " +
      "check completion. Ensure credit guarantee scheme coverage (CGTMSE/CGFMU) is obtained " +
      "where applicable. At branch level, verify that insurance renewal premiums are debited " +
      "to respective accounts on time and renewal policies are taken on record before expiry, " +
      "that bank's charge is noted on each insurance policy, and that burglary and own-damage " +
      "covers are obtained where applicable. Confirm consent of guarantors is obtained and " +
      "taken on record.",
  },
  {
    code: "CRD-HLN-DOC-003",
    name: "Builder / Developer Due Diligence",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-DOC",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "For under-construction properties, verify that the builder/developer is on the bank's " +
      "approved list or that fresh due diligence is documented. Confirm RERA registration of " +
      "the project and verify that occupation/completion certificate is obtained for completed " +
      "units. Check that tripartite agreement is executed between bank, borrower, and builder. " +
      "Validate that builder's track record, financial health, and litigation status are " +
      "assessed and documented.",
  },
  {
    code: "CRD-HLN-DOC-004",
    name: "Post-Disbursement Document Compliance",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-DOC",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that end-use certificate is obtained within the policy-prescribed period after " +
      "final disbursement. Confirm construction progress photographs / site visit reports " +
      "are documented at each stage-linked disbursement. Ensure that all pending documents " +
      "noted at the time of sanction (MODT, OC, sale deed, etc.) are collected within the " +
      "stipulated timeline and the document deficiency register is nil or within tolerance. " +
      "At branch level, verify that CA-certified cost of project and means of finance " +
      "certificates are obtained with evidence of capital infusion and unsecured loan " +
      "contribution as committed, and that shares (up to 51%) with SH4 form are taken on " +
      "record where applicable.",
  },

  // ── depth 3: Sanction & Approval leaf items ────────────────────

  {
    code: "CRD-HLN-SAN-001",
    name: "Sanctioning Authority & Delegation of Powers",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-SAN",
    weight: 1.0,
    isCritical: true,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that every housing loan is sanctioned by the competent authority as per the " +
      "bank's Board-approved delegation of powers (e.g. Assistant Manager + Branch Manager, " +
      "or Manager + AGM for higher limits). Confirm that loans at or above the threshold " +
      "requiring committee-level approval have recorded minutes with member signatures. " +
      "Check that no single official has sanctioned beyond their delegated limit and that " +
      "the four-eyes principle (maker-checker) is applied. At branch level, verify ADHOC " +
      "limit sanctions during the audit period have proper authority approval and that " +
      "deviation approvals (e.g. ITR gaps, collateral shortfalls) are taken from the " +
      "next-higher authority with documented rationale.",
  },
  {
    code: "CRD-HLN-SAN-002",
    name: "Loan-to-Value Ratio & Exposure Norms",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-SAN",
    weight: 1.0,
    isCritical: true,
    riskCategory: "Credit Risk",
    regulatoryRef: "RBI/2024-25/DoR.CRE.REC",
    description:
      "Verify that the sanctioned LTV ratio is within RBI/NHB-prescribed limits (up to 90% " +
      "for loans <= Rs.30 lakh, 80% for loans Rs.30-75 lakh, 75% for loans above Rs.75 lakh). " +
      "Confirm that valuation used for LTV is the lower of market value and guideline/ " +
      "ready-reckoner value. Ensure single-borrower and group exposure ceilings comply with " +
      "RBI Master Directions. Validate that risk weight assignment corresponds to the LTV " +
      "band for capital adequacy computation.",
  },
  {
    code: "CRD-HLN-SAN-003",
    name: "Interest Rate & Pricing Compliance",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-SAN",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that the interest rate applied is linked to the Board-approved benchmark " +
      "(EBLR/MCLR/PLR as applicable) and that the spread/margin is within the approved " +
      "pricing grid based on credit score, LTV, and loan amount. Confirm that rate reset " +
      "periodicity and methodology are disclosed in the loan agreement as per RBI fair " +
      "practices code. At branch level, verify that the rate of interest is correctly " +
      "entered in the CBS system, that credit rating is correctly computed and applied for " +
      "loans above Rs. 1 crore, and that interest failure reports are generated and reviewed " +
      "with no unexplained entries. Confirm that no manual commission reversals are done " +
      "without appropriate authority approval.",
  },
  {
    code: "CRD-HLN-SAN-004",
    name: "Sanction Letter Completeness & Borrower Acknowledgement",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-SAN",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that the sanction letter contains all mandatory terms: loan amount, tenure, " +
      "rate of interest, repayment schedule, security details, pre-payment and foreclosure " +
      "charges, and all conditions precedent to disbursement. Confirm borrower/co-borrower " +
      "and guarantor acceptance is obtained in writing before disbursement - at branch level " +
      "verify that signed acceptance of sanction letter by borrower and all guarantors is " +
      "physically present in the loan file. Ensure that MITC (Most Important Terms & " +
      "Conditions) are separately communicated in the borrower's language of choice as per " +
      "RBI fair lending guidelines. Verify that quotation change charges (plus GST) are " +
      "collected where applicable per sanction terms.",
  },

  // ── depth 3: Disbursement Controls leaf items ──────────────────

  {
    code: "CRD-HLN-DIS-001",
    name: "Pre-Disbursement Condition Compliance",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-DIS",
    weight: 1.0,
    isCritical: true,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that all conditions precedent listed in the sanction letter are fulfilled " +
      "before first disbursement, including mortgage creation, insurance, PDC/ECS/NACH " +
      "mandate, and personal guarantee execution. Confirm that the disbursement checklist " +
      "is signed off by the designated officer and that no disbursement is released with " +
      "outstanding critical conditions. Check that the borrower's account is opened/KYC'd " +
      "in CBS prior to disbursement credit. At branch level, ensure the branch has prepared " +
      "a proper disbursement docket covering all terms and conditions from the sanction " +
      "letter, that conditional disbursement clauses (e.g. CC limit release after achieving " +
      "specified GST sales thresholds) are monitored, and that unsecured loan repayment " +
      "restrictions are enforced as per sanction terms.",
  },
  {
    code: "CRD-HLN-DIS-002",
    name: "Stage-Linked Disbursement & End-Use Monitoring",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-DIS",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "For under-construction or self-construction loans, verify that disbursements are " +
      "released in stages linked to certified construction progress. Confirm that a bank " +
      "official or empanelled engineer/architect has physically verified each stage before " +
      "release. Validate that funds are credited directly to the builder/developer/vendor " +
      "and not routed through the borrower's personal account unless justified. Ensure end-use " +
      "certificate is obtained within 90 days of each tranche.",
  },
  {
    code: "CRD-HLN-DIS-003",
    name: "Disbursement to Builder & Direct Payment Controls",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-DIS",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that disbursement cheques/NEFT are drawn in favour of the builder/seller/land " +
      "owner and not the borrower, except for permitted cost components (stamp duty, " +
      "registration, interiors) with documented justification. Confirm that the builder's " +
      "receipt and allotment letter tally with the disbursed amount. Ensure that no excess " +
      "disbursement over sanctioned amount has occurred and that any modification in the " +
      "disbursement schedule is approved by competent authority.",
  },

  // ── depth 3: Post-Disbursement Monitoring leaf items ───────────

  {
    code: "CRD-HLN-MON-001",
    name: "EMI Repayment Tracking & Overdue Management",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-MON",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that EMI collection is through NACH/ECS mandate with auto-debit on due date " +
      "and that bounce instances are tracked and reported. Confirm that overdue accounts " +
      "are followed up as per the collection policy with documented call logs, notices, and " +
      "visit reports. At branch level, verify overdue register is maintained with accounts " +
      "overdue more than 60 days separately flagged, system-generated notices are sent to " +
      "borrowers, co-borrowers and guarantors, and standing instructions / PDCs / credit " +
      "ECS are taken on record. Confirm that no debits for other ECS/payments are allowed " +
      "from operative accounts when term loan overdues exist. Ensure demand letters and " +
      "recall notices are served before initiating recovery proceedings under SARFAESI.",
  },
  {
    code: "CRD-HLN-MON-002",
    name: "Annual Review & Collateral Revaluation",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-MON",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that housing loan accounts are reviewed at least annually including income " +
      "reassessment for self-employed borrowers and property revaluation at the prescribed " +
      "frequency (at least once in three years or as per policy). Confirm that the " +
      "revaluation report is from an empanelled valuer and that the updated LTV is within " +
      "prescribed limits. At branch level, verify that quarterly site visits are conducted " +
      "by appropriate authority with visit reports taken on record (check date of last visit " +
      "against policy frequency), that latest ITR of the firm and all directors/guarantors " +
      "is collected for the applicable assessment year, and that review applications are " +
      "complete with all required signatures. Ensure that CC/OD limits pending review for " +
      "more than 3 months are flagged and escalated.",
  },
  {
    code: "CRD-HLN-MON-003",
    name: "SMA Classification & Early Warning Signals",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-MON",
    weight: 1.0,
    isCritical: true,
    riskCategory: "Credit Risk",
    regulatoryRef: "RBI/2024-25/DoR.STR.REC",
    description:
      "Verify that SMA (Special Mention Accounts) classification is generated by CBS " +
      "automatically based on DPD: SMA-0 (1-30 days), SMA-1 (31-60 days), SMA-2 (61-90 " +
      "days). Confirm that SMA-2 accounts are reported to CRILC within prescribed timelines. " +
      "Validate that early warning signals (job loss, business closure, property dispute, " +
      "frequent EMI bounces, CIBIL score drop) are monitored and trigger proactive " +
      "restructuring dialogue. Ensure that resolution plans are initiated within 30 days of " +
      "default as per RBI Prudential Framework.",
  },
  {
    code: "CRD-HLN-MON-004",
    name: "NPA Recognition & Provisioning",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-MON",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: "RBI/2024-25/DoR.STR.REC",
    description:
      "Verify that NPA recognition follows RBI Master Directions with classification after " +
      "90 days past due. Confirm that the CBS-driven NPA flag is not manually overridden " +
      "without authorized approval. Validate that provisioning (15% sub-standard, 25-40% " +
      "doubtful based on age, 100% loss) is applied correctly and that IRAC norms are " +
      "adhered to. Ensure that NPA upgradation is only on full clearance of arrears and " +
      "that no evergreening through restructuring is observed.",
  },

  // ── depth 3: Regulatory Compliance leaf items ──────────────────

  {
    code: "CRD-HLN-REG-001",
    name: "Priority Sector Lending Classification",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-REG",
    weight: 1.0,
    isCritical: true,
    riskCategory: "Credit Risk",
    regulatoryRef: "RBI/2024-25/FIDD.CO.Plan.BC",
    description:
      "Verify that housing loans up to Rs.35 lakh (metropolitan) / Rs.25 lakh (non-metropolitan) " +
      "for dwellings valued up to Rs.45 lakh / Rs.30 lakh are correctly classified as Priority " +
      "Sector Lending per RBI Master Direction on PSL. Confirm that the classification is " +
      "reviewed at sanction and annually and that mis-classified loans are corrected before " +
      "PSL reporting dates. Ensure that Weaker Section sub-targets are met and PSL shortfall " +
      "is deposited with RIDF/NHB as applicable.",
  },
  {
    code: "CRD-HLN-REG-002",
    name: "PMAY Subsidy & Government Scheme Compliance",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-REG",
    weight: 1.0,
    isCritical: true,
    riskCategory: "Credit Risk",
    regulatoryRef: "PMAY-CLSS Guidelines",
    description:
      "Verify that PMAY-CLSS eligible borrowers are identified at sanction based on income " +
      "category (EWS/LIG/MIG-I/MIG-II) and that subsidy claims are submitted to NHB/HUDCO " +
      "within prescribed timelines. Confirm that the Net Present Value of subsidy is credited " +
      "to the borrower's loan account on receipt and that the effective EMI is recalculated. " +
      "Ensure that the Aadhaar-linked DBT verification is completed and documented, and that " +
      "duplicate subsidy claims are prevented through the CLSS-Awas Portal check.",
  },
  {
    code: "CRD-HLN-REG-003",
    name: "Fair Practices Code & Customer Grievance Redressal",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-REG",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify compliance with RBI Fair Practices Code including: transparent communication " +
      "of all charges and fees, MITC provided in vernacular language, no coercive recovery " +
      "practices, and adherence to prepayment/foreclosure guidelines (no prepayment penalty " +
      "on floating rate loans as per RBI circular). Confirm that the Grievance Redressal " +
      "mechanism is operational with designated nodal officer and that complaints are resolved " +
      "within the prescribed TAT. At branch level, verify that pre-closure charges are " +
      "collected properly wherever applicable, that all charges on newly sanctioned/disbursed " +
      "loans are taken as per approved schedule, and that loan application forms are issued " +
      "by the authorized personnel (AM/BM) after confirming eligibility as per credit " +
      "circular guidelines. Ensure that the RBI Integrated Ombudsman Scheme details are " +
      "displayed at the branch.",
  },
  {
    code: "CRD-HLN-REG-004",
    name: "Statutory & Regulatory Returns",
    depth: 3,
    isLeaf: true,
    parentCode: "CRD-HLN-REG",
    weight: 1.0,
    isCritical: false,
    riskCategory: "Credit Risk",
    regulatoryRef: null,
    description:
      "Verify that all statutory returns related to housing loans are filed within prescribed " +
      "timelines: CRILC reporting for SMA-2/NPA accounts, NHB quarterly returns on housing " +
      "finance activity, RBI DSB returns on PSL compliance, and CERSAI registration within " +
      "30 days. Confirm that the audit trail of return submissions is maintained with " +
      "acknowledgement receipts. Ensure that any observations from RBI inspection or statutory " +
      "audit on housing loan portfolio are tracked in the compliance monitoring system with " +
      "closure evidence.",
  },
];

/* ------------------------------------------------------------------ */
/*  Main upsert logic                                                 */
/* ------------------------------------------------------------------ */
async function main() {
  const tenantId = await resolveTenantId();

  // Map code -> id for parent references; track path for auto-computation
  const codeToId: Record<string, string> = {};
  const codeToPath: Record<string, string> = {};

  // Counters by depth
  const counters: Record<number, number> = {};

  console.log("\nUpserting ExaminationNode records ...\n");

  for (const [index, node] of NODES.entries()) {
    const parentId = node.parentCode ? codeToId[node.parentCode] : null;

    if (node.parentCode && !parentId) {
      throw new Error(
        `Parent code "${node.parentCode}" not yet upserted - check NODES ordering.`,
      );
    }

    // Auto-compute materialized path from parent chain
    const parentPath = node.parentCode ? codeToPath[node.parentCode] : null;
    const path = parentPath ? `${parentPath}/${node.code}` : node.code;

    // Auto-compute displayOrder: position within siblings (1-based)
    const siblingsBefore = NODES.slice(0, index).filter(
      (n) => n.parentCode === node.parentCode && n.depth === node.depth,
    );
    const displayOrder = siblingsBefore.length + 1;

    const upserted = await prisma.examinationNode.upsert({
      where: {
        tenantId_code: { tenantId, code: node.code },
      },
      create: {
        tenantId,
        code: node.code,
        name: node.name,
        path,
        depth: node.depth,
        isLeaf: node.isLeaf,
        parentId,
        weight: node.weight,
        isCritical: node.isCritical,
        riskCategory: node.riskCategory,
        regulatoryRef: node.regulatoryRef,
        applicableBranchTypes: [],
        description: node.description,
        displayOrder,
        isActive: true,
      },
      update: {
        // Mutable fields safe to refresh on re-run
        name: node.name,
        description: node.description,
        weight: node.weight,
        isCritical: node.isCritical,
        riskCategory: node.riskCategory,
        regulatoryRef: node.regulatoryRef,
        displayOrder,
        isActive: true,
        // NOTE: depth, isLeaf, parentId, path are structural - not updated on re-run
      },
    });

    codeToId[node.code] = upserted.id;
    codeToPath[node.code] = path;
    counters[node.depth] = (counters[node.depth] ?? 0) + 1;
  }

  /* ---------------------------------------------------------------- */
  /*  Summary table                                                   */
  /* ---------------------------------------------------------------- */
  console.log("Upsert complete.\n");
  console.log("+--------+--------+-------------------------------------+");
  console.log("| Depth  | Count  | Description                         |");
  console.log("+--------+--------+-------------------------------------+");
  const descriptions: Record<number, string> = {
    0: "Root (Credit Risk)",
    1: "Module (Housing Loans)",
    2: "Sub-modules",
    3: "Leaf items (value statements)",
  };
  let total = 0;
  for (const d of [0, 1, 2, 3]) {
    const c = counters[d] ?? 0;
    total += c;
    console.log(
      `|   ${d}    |   ${String(c).padStart(2)}   | ${(descriptions[d] ?? "").padEnd(35)} |`,
    );
  }
  console.log("+--------+--------+-------------------------------------+");
  console.log(
    `| Total  |   ${String(total).padStart(2)}   |                                     |`,
  );
  console.log("+--------+--------+-------------------------------------+");

  // Critical items
  const criticalItems = NODES.filter((n) => n.isCritical);
  console.log(`\nCritical items (${criticalItems.length}):`);
  for (const ci of criticalItems) {
    console.log(`   ${ci.code}  ${ci.name}`);
  }

  // Weight sum verification
  const subModules = NODES.filter((n) => n.depth === 2);
  const weightSum = subModules.reduce((s, n) => s + n.weight, 0);
  console.log(`\nSub-module weights sum: ${weightSum.toFixed(2)}`);
  if (Math.abs(weightSum - 1.0) > 0.001) {
    console.warn("WARNING: Weights do not sum to 1.0!");
  }

  console.log("\nDone.\n");
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
