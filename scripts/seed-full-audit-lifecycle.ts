/**
 * seed-full-audit-lifecycle.ts
 * ---------------------------------------------------------------------------
 * Standalone seed script that creates a complete RBIA audit lifecycle for
 * Kothrud Branch (BR002) — from RAM assessment through board reporting.
 *
 * Prerequisites: pnpm db:seed → seed-rbia-housing → seed-exam-questions
 * Usage: pnpm seed:lifecycle [--tenant-id=<uuid>]
 * Idempotent: deletes previous lifecycle data, then re-creates.
 * ---------------------------------------------------------------------------
 */

import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "crypto";
import { withTriggersDetached } from "../src/lib/audit-triggers";

/* ─── Bootstrap ──────────────────────────────────────────────────────────── */

const connectionString = (process.env.DATABASE_OWNER_URL ??
  process.env.DATABASE_URL)!;
const adapter = new PrismaPg({ connectionString, max: 25 });
const prisma = new PrismaClient({ adapter } as any);

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/** Deterministic UUID from label — same ID every run for idempotency */
function uid(label: string): string {
  const h = createHash("sha256")
    .update(`AEGIS_LIFECYCLE:${label}`)
    .digest("hex");
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    "4" + h.slice(13, 16),
    ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20),
    h.slice(20, 32),
  ].join("-");
}

function d(s: string): Date {
  return new Date(s);
}

/* ─── Deterministic IDs ──────────────────────────────────────────────────── */

const ID = {
  eng1: uid("eng:kothrud-q3-2025"),
  eng2: uid("eng:shivajinagar-q3-2025"),
  ram: uid("ram:kothrud-2025-26"),
  score: uid("score:kothrud-q3"),
  board: uid("board:q4-2025"),
  batch: uid("batch:kothrud-q3"),
  sampling: uid("samp:kothrud-hln"),
  modSel: uid("modsel:kothrud-hln"),
  meetOpen: uid("meet:kothrud-open"),
  meetExit: uid("meet:kothrud-exit"),
  meet2Open: uid("meet:shivaji-open"),
  teamLead: uid("team:kothrud-lead"),
  teamField: uid("team:kothrud-field"),
  team2Lead: uid("team:shivaji-lead"),
  obs: Array.from({ length: 6 }, (_, i) => uid(`obs:${i + 1}`)),
  ci: Array.from({ length: 6 }, (_, i) => uid(`ci:${i + 1}`)),
  ap: Array.from({ length: 12 }, (_, i) => uid(`ap:${i + 1}`)),
  loan: Array.from({ length: 50 }, (_, i) => uid(`loan:${i + 1}`)),
  sma: [
    "SMA0",
    "SMA1",
    "SMA2",
    "NPA_SUB_STANDARD",
    "NPA_DOUBTFUL",
    "NPA_LOSS",
  ].map((c) => uid(`sma:${c}`)),
  snap: Array.from({ length: 4 }, (_, i) => uid(`snap:${i}`)),
  log: Array.from({ length: 10 }, (_, i) => uid(`log:${i}`)),
  uba: Array.from({ length: 3 }, (_, i) => uid(`uba:${i}`)),
  ar: Array.from({ length: 2 }, (_, i) => uid(`ar:${i}`)),
};

/* ─── Score distribution for 23 leaf examination items ───────────────────── */

const SCORES: Array<{
  code: string;
  label: string;
  score: number;
  flag?: string;
  notes?: string;
}> = [
  // PRE — 0.9375
  {
    code: "CRD-HLN-PRE-001",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "All borrower eligibility checks and KYC documents verified. Aadhaar-PAN linkage confirmed for all sampled accounts. Dedupe and negative-list screening completed before appraisal in all cases reviewed.",
  },
  {
    code: "CRD-HLN-PRE-002",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "Income assessment consistently based on audited financials and ITR. FOIR ratios within policy limits across all sampled accounts.",
  },
  {
    code: "CRD-HLN-PRE-003",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "Property valuations by empanelled valuers within validity. Title search reports covering 30+ years in all sampled files.",
  },
  {
    code: "CRD-HLN-PRE-004",
    label: "LARGELY_COMPLIANT",
    score: 0.75,
    notes:
      "CIBIL reports pulled for all primary borrowers but in 3 out of 10 sampled cases, co-applicant credit bureau reports were either missing or pulled beyond the 30-day validity window. Specifically, accounts HL-KTH-2025-0008 and HL-KTH-2025-0023 had co-applicant CIBIL pulled 45 days prior to sanction. Account HL-KTH-2025-0031 was missing guarantor CIBIL entirely. The branch has been advised to strengthen the pre-sanction checklist to include co-applicant and guarantor CIBIL validity checks. No material credit risk identified as all primary borrower scores were above threshold.",
  },
  // DOC — 0.875
  {
    code: "CRD-HLN-DOC-001",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "Loan agreements executed on proper stamp paper. Mortgages registered with Sub-Registrar. CERSAI registrations completed within 30 days.",
  },
  {
    code: "CRD-HLN-DOC-002",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "Property insurance covers reinstatement value with bank as loss-payee. Life insurance coverage in place.",
  },
  {
    code: "CRD-HLN-DOC-003",
    label: "LARGELY_COMPLIANT",
    score: 0.75,
    notes:
      "Builder/developer due diligence documented in 8 of 10 under-construction cases reviewed. Two files (HL-KTH-2025-0015, HL-KTH-2025-0029) had builder empanelment expired at the time of sanction, though subsequent renewal was on record. RERA registration verified for all projects. The branch needs to ensure builder empanelment validity is checked as part of the pre-disbursement compliance checklist to avoid approvals against lapsed empanelments. Tripartite agreements executed in all applicable cases.",
  },
  {
    code: "CRD-HLN-DOC-004",
    label: "LARGELY_COMPLIANT",
    score: 0.75,
    notes:
      "End-use certificates obtained for 85% of disbursed accounts within policy timeline. Three accounts showed delayed end-use certification beyond the 90-day window — specifically HL-KTH-2025-0004 (112 days), HL-KTH-2025-0019 (98 days), and HL-KTH-2025-0042 (105 days). Construction progress photographs documented at each stage-linked disbursement. Document deficiency register maintained but 2 entries pending beyond tolerance period. The branch attributes delays to borrower non-cooperation and has initiated follow-up notices.",
  },
  // SAN — 0.8125
  {
    code: "CRD-HLN-SAN-001",
    label: "PARTIALLY_COMPLIANT",
    score: 0.5,
    flag: "obs,ap",
    notes:
      "Critical finding: In 4 of 10 sampled housing loan accounts, sanctioning authority was exceeded. Account HL-KTH-2025-0003 (Rs.45 lakh) sanctioned by Branch Manager alone without co-signature from AGM as required for sanctions above Rs.25 lakh per Board-approved delegation of powers circular dated 15-Mar-2024. Accounts HL-KTH-2025-0012 and HL-KTH-2025-0037 similarly sanctioned without committee-level approval despite crossing the threshold. Account HL-KTH-2025-0048 showed sanction by a single official beyond delegated limit without documented deviation approval. Four-eyes principle violated in all four cases. This represents a systemic control weakness in the sanction workflow at this branch.",
  },
  {
    code: "CRD-HLN-SAN-002",
    label: "LARGELY_COMPLIANT",
    score: 0.75,
    notes:
      "LTV ratios within prescribed limits for 9 of 10 accounts. One account (HL-KTH-2025-0037) had LTV at 82% against the 80% cap for the loan slab, with documented deviation approved by AGM. Risk weights correctly assigned for capital adequacy.",
  },
  {
    code: "CRD-HLN-SAN-003",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "Interest rates linked to Board-approved EBLR benchmark. Spread within approved pricing grid.",
  },
  {
    code: "CRD-HLN-SAN-004",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "Sanction letters contain all mandatory terms. Borrower acceptance obtained in writing before disbursement.",
  },
  // DIS — 0.9167
  {
    code: "CRD-HLN-DIS-001",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "All pre-disbursement conditions fulfilled before first disbursement. Disbursement checklists signed off.",
  },
  {
    code: "CRD-HLN-DIS-002",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "Stage-linked disbursements verified with engineer certificates. End-use certificates obtained.",
  },
  {
    code: "CRD-HLN-DIS-003",
    label: "LARGELY_COMPLIANT",
    score: 0.75,
    notes:
      "Disbursement cheques drawn in favour of builder/seller in most cases. Two accounts had partial disbursement to borrower's account for stamp duty and registration charges, with documented justification present in both files. No excess disbursements over sanctioned amounts observed.",
  },
  // MON — 0.625
  {
    code: "CRD-HLN-MON-001",
    label: "FULLY_COMPLIANT",
    score: 1.0,
    notes:
      "EMI collection via NACH mandate with auto-debit on due dates. Bounce instances tracked and reported.",
  },
  {
    code: "CRD-HLN-MON-002",
    label: "PARTIALLY_COMPLIANT",
    score: 0.5,
    flag: "ap",
    notes:
      "Annual review conducted for only 6 of 10 sampled housing loan accounts that were due for review during the audit period. Four accounts — HL-KTH-2025-0005 (self-employed, last review 18 months ago), HL-KTH-2025-0014 (proprietorship, last review 22 months ago), HL-KTH-2025-0033 (partnership firm, review overdue by 6 months), and HL-KTH-2025-0041 (self-employed professional, last review 15 months ago) — had overdue annual reviews. Property revaluation was pending for 2 accounts beyond the 3-year cycle. The branch cites staff shortage and workload pressures but has committed to completing all pending reviews within 60 days.",
  },
  {
    code: "CRD-HLN-MON-003",
    label: "LARGELY_COMPLIANT",
    score: 0.75,
    flag: "obs,ap",
    notes:
      "SMA classification generated by CBS based on DPD. However, in 2 accounts, SMA-2 reporting to CRILC was delayed by 5 and 8 days respectively beyond the prescribed timeline. Early warning signal monitoring framework exists but documentation of proactive restructuring dialogue was absent for 1 SMA-1 account that subsequently slipped to NPA. Branch has been advised to implement weekly SMA review meetings with documented minutes.",
  },
  {
    code: "CRD-HLN-MON-004",
    label: "NON_COMPLIANT",
    score: 0.0,
    flag: "obs,ap",
    notes:
      "Significant deficiencies in NPA recognition and provisioning compliance. One account (HL-KTH-2025-0049) with DPD of 120 days was not classified as NPA in the CBS system — manual override by branch staff prevented automatic NPA flagging without documented authorization from competent authority. Provisioning for 2 NPA-Sub Standard accounts was at 10% instead of the required 15% per IRAC norms. The NPA-Doubtful account (HL-KTH-2025-0050, DPD 400 days, 18 months in NPA) was provisioned at 25% against the required 40% for the doubtful-II category. Total provisioning shortfall estimated at Rs.3.2 lakh across the housing loan portfolio. No evidence of evergreening detected. Branch attributes CBS override to a pending restructuring application that was never formalized.",
  },
  // REG — 0.25
  {
    code: "CRD-HLN-REG-001",
    label: "PARTIALLY_COMPLIANT",
    score: 0.5,
    flag: "ap",
    notes:
      "Priority Sector Lending classification reviewed at sanction but annual re-verification incomplete. Two housing loans totaling Rs.58 lakh were incorrectly classified as PSL despite property values exceeding the Rs.45 lakh threshold for metropolitan areas per RBI Master Direction. The branch had classified these based on loan amount (below Rs.35 lakh) without verifying the property value criterion. This misclassification impacts the bank's PSL reporting accuracy. Corrective re-classification has been recommended for the current reporting quarter.",
  },
  {
    code: "CRD-HLN-REG-002",
    label: "PARTIALLY_COMPLIANT",
    score: 0.5,
    flag: "ap",
    notes:
      "PMAY-CLSS subsidy claims were submitted for 4 eligible borrowers but 2 claims were delayed beyond the prescribed timeline by 45 and 60 days respectively. NPV of subsidy credited correctly upon receipt. Aadhaar-linked DBT verification completed. The branch attributes delays to incomplete documentation from borrowers but no documented follow-up trail was maintained to evidence timely pursuit of missing documents. Recommended implementation of a PMAY tracking register with weekly escalation protocol.",
  },
  {
    code: "CRD-HLN-REG-003",
    label: "NON_COMPLIANT",
    score: 0.0,
    flag: "ap",
    notes:
      "Multiple fair practices code violations identified. MITC not provided in vernacular language (Marathi) for 6 of 10 sampled borrowers despite the branch operating in a predominantly Marathi-speaking area. Grievance redressal mechanism details not displayed at the branch — the designated nodal officer's name and contact were absent from the notice board. Two customer complaints regarding delayed foreclosure processing remained unresolved beyond the 30-day TAT prescribed by RBI. The branch is not maintaining a complaint register as required under the Fair Practices Code framework.",
  },
  {
    code: "CRD-HLN-REG-004",
    label: "NON_COMPLIANT",
    score: 0.0,
    flag: "ap",
    notes:
      "CERSAI registration delayed beyond 30 days for 3 accounts — HL-KTH-2025-0016 (registered after 52 days), HL-KTH-2025-0028 (45 days), and HL-KTH-2025-0044 (68 days). CRILC reporting for SMA-2 accounts delayed as noted in MON-003. Audit trail of statutory return submissions maintained but acknowledgement receipts missing for 2 quarterly returns. Branch has no documented tracking mechanism for statutory filing deadlines — compliance is currently managed through informal calendar reminders rather than a systematic compliance management framework.",
  },
];

/* ─── Loan account templates ─────────────────────────────────────────────── */

const FIRST_NAMES = [
  "Ramesh",
  "Sunil",
  "Prakash",
  "Mahesh",
  "Rajendra",
  "Ganesh",
  "Vinod",
  "Arun",
  "Sanjay",
  "Deepak",
  "Mohan",
  "Subhash",
  "Ashok",
  "Vijay",
  "Dilip",
  "Nitin",
  "Sachin",
  "Ajay",
  "Manoj",
  "Rakesh",
  "Santosh",
  "Pramod",
  "Anand",
  "Milind",
  "Kishor",
  "Suhas",
  "Ravindra",
  "Yogesh",
  "Sandip",
  "Tushar",
  "Hemant",
  "Kiran",
  "Jayant",
  "Shrikant",
  "Umesh",
  "Vaibhav",
  "Aniket",
  "Prashant",
  "Nilesh",
  "Amol",
  "Swapnil",
  "Vishal",
  "Rohit",
  "Rahul",
  "Abhijit",
  "Mangesh",
  "Dinesh",
  "Satish",
  "Girish",
  "Bharat",
];
const LAST_NAMES = [
  "Patil",
  "Deshmukh",
  "Kulkarni",
  "Joshi",
  "Deshpande",
  "Bhosale",
  "Shinde",
  "Jadhav",
  "More",
  "Pawar",
  "Chavan",
  "Gaikwad",
  "Kadam",
  "Nimbalkar",
  "Salunkhe",
  "Kale",
  "Thorat",
  "Mane",
  "Bhor",
  "Suryawanshi",
  "Ghorpade",
  "Kamble",
  "Waghmare",
  "Raut",
  "Wagh",
  "Yadav",
  "Sonawane",
  "Sawant",
  "Gavhane",
  "Shelar",
  "Londhe",
  "Aher",
  "Khairnar",
  "Dhage",
  "Phule",
  "Dolas",
  "Misal",
  "Ingale",
  "Bhagat",
  "Ransing",
  "Pisal",
  "Kharat",
  "Tupe",
  "Bansode",
  "Gunjal",
  "Avhad",
  "Shirke",
  "Dudhane",
  "Pansare",
  "Dalvi",
];
const PRODUCTS = [
  "Home Purchase",
  "Home Purchase",
  "Home Purchase",
  "Home Purchase",
  "Home Purchase",
  "Home Purchase",
  "Plot Purchase + Construction",
  "Plot Purchase + Construction",
  "Home Renovation",
  "Home Construction",
];

function loanAmount(i: number): number {
  if (i < 15) return 500000 + i * 70000; // 5L–15.3L
  if (i < 35) return 1500000 + (i - 15) * 100000; // 15L–35L
  return 3500000 + (i - 35) * 270000; // 35L–75.5L
}

function assetInfo(i: number): { assetClass: string; dpd: number } {
  if (i < 35) return { assetClass: "STANDARD", dpd: 0 };
  if (i < 40) return { assetClass: "SMA0", dpd: 10 + (i % 20) };
  if (i < 44) return { assetClass: "SMA1", dpd: 35 + (i % 25) };
  if (i < 47) return { assetClass: "SMA2", dpd: 65 + (i % 25) };
  if (i < 49) return { assetClass: "NPA_SUB", dpd: 100 + i * 10 };
  return { assetClass: "NPA_DOUBTFUL", dpd: 400 };
}

/* ─── Action point definitions ───────────────────────────────────────────── */

const ACTION_POINTS: Array<{
  title: string;
  description: string;
  severity: string;
  moduleCode: string;
  hasBmResponse: boolean;
}> = [
  {
    title: "Sanctioning authority exceeded in 4 housing loan accounts",
    severity: "CRITICAL",
    moduleCode: "CRD-HLN-SAN",
    description:
      "Branch Manager sanctioned loans above Rs.25 lakh without requisite co-signature from AGM as per Board-approved delegation of powers (circular dt. 15-Mar-2024). Four accounts identified: HL-KTH-2025-0003 (Rs.45L), HL-KTH-2025-0012 (Rs.38L), HL-KTH-2025-0037 (Rs.52L), HL-KTH-2025-0048 (Rs.41L). Aggregate exposure of Rs.1.76 crore sanctioned without proper authority. Four-eyes principle violated.",
    hasBmResponse: true,
  },
  {
    title:
      "PSL misclassification — 2 housing loans incorrectly tagged as Priority Sector",
    severity: "CRITICAL",
    moduleCode: "CRD-HLN-REG",
    description:
      "Two housing loans (Rs.32L and Rs.26L) classified as PSL despite property values exceeding Rs.45 lakh metropolitan threshold. Loan amounts met the Rs.35 lakh criterion but property value verification was not performed. This impacts RBI PSL reporting accuracy and may attract regulatory scrutiny during inspection.",
    hasBmResponse: true,
  },
  {
    title:
      "NPA provisioning shortfall of Rs.3.2 lakh in housing loan portfolio",
    severity: "HIGH",
    moduleCode: "CRD-HLN-MON",
    description:
      "Provisioning for NPA-Sub Standard accounts at 10% vs required 15%. NPA-Doubtful (18-month vintage) provisioned at 25% vs required 40% (Doubtful-II). One 120-DPD account not flagged as NPA due to unauthorized CBS manual override. Total provisioning shortfall Rs.3.2 lakh.",
    hasBmResponse: true,
  },
  {
    title: "Delayed SMA-2 reporting to CRILC",
    severity: "HIGH",
    moduleCode: "CRD-HLN-MON",
    description:
      "Two SMA-2 accounts reported to CRILC with delays of 5 and 8 days beyond prescribed timeline. Early warning signal monitoring documentation inadequate for 1 SMA-1 account that subsequently slipped to NPA. Weekly SMA review meeting minutes not maintained.",
    hasBmResponse: true,
  },
  {
    title: "CERSAI registration delayed beyond 30 days for 3 accounts",
    severity: "HIGH",
    moduleCode: "CRD-HLN-REG",
    description:
      "CERSAI charge registration delayed for accounts HL-KTH-2025-0016 (52 days), HL-KTH-2025-0028 (45 days), HL-KTH-2025-0044 (68 days). Non-compliance with statutory 30-day requirement exposes the bank to risk of charge not being recognized in priority during recovery.",
    hasBmResponse: false,
  },
  {
    title:
      "KYC gaps — co-applicant CIBIL reports missing or expired in 3 accounts",
    severity: "MEDIUM",
    moduleCode: "CRD-HLN-PRE",
    description:
      "Co-applicant credit bureau reports either missing (1 account) or pulled beyond 30-day validity (2 accounts). While primary borrower CIBIL was current, incomplete co-applicant verification weakens credit assessment quality.",
    hasBmResponse: true,
  },
  {
    title: "Credit appraisal gaps — annual reviews overdue for 4 accounts",
    severity: "MEDIUM",
    moduleCode: "CRD-HLN-MON",
    description:
      "Annual review not conducted for 4 housing loan accounts (self-employed/proprietorship borrowers) with overdue periods ranging from 6 to 22 months. Property revaluation pending for 2 accounts beyond 3-year cycle. Risk of undetected borrower credit deterioration.",
    hasBmResponse: true,
  },
  {
    title: "Insurance policy lapse on collateral property — 2 accounts",
    severity: "MEDIUM",
    moduleCode: "CRD-HLN-DOC",
    description:
      "Property insurance policies expired for 2 housing loan accounts (HL-KTH-2025-0019, HL-KTH-2025-0035) with coverage gaps of 45 and 30 days respectively. During the lapse period, collateral was uninsured against fire, flood, and natural disaster risk. Renewal premiums not auto-debited as per standing instructions.",
    hasBmResponse: false,
  },
  {
    title: "Guarantor verification incomplete in 2 loan files",
    severity: "MEDIUM",
    moduleCode: "CRD-HLN-DOC",
    description:
      "Guarantor KYC documentation incomplete in 2 files. One file missing guarantor's income proof, other missing guarantor's CIBIL report. Guarantee deeds executed but guarantor creditworthiness not independently verified as per policy requirement.",
    hasBmResponse: true,
  },
  {
    title:
      "Post-disbursement documentation deficiencies — end-use certificates delayed",
    severity: "LOW",
    moduleCode: "CRD-HLN-DOC",
    description:
      "End-use certificates delayed beyond 90-day window for 3 accounts (112, 98, and 105 days). Document deficiency register has 2 entries pending beyond tolerance. While follow-up notices issued, no escalation to supervisory authority as required by policy for delays beyond 90 days.",
    hasBmResponse: true,
  },
  {
    title: "Overdue register not maintained in prescribed format",
    severity: "LOW",
    moduleCode: "CRD-HLN-MON",
    description:
      "Overdue register maintained but not in the prescribed format per head office circular dt. 01-Jul-2025. Accounts overdue beyond 60 days not separately flagged as required. System-generated notices to guarantors not issued for 2 overdue accounts.",
    hasBmResponse: false,
  },
  {
    title:
      "Sanction letter acceptance — borrower signatures on photocopy in 1 file",
    severity: "LOW",
    moduleCode: "CRD-HLN-SAN",
    description:
      "In one loan file (HL-KTH-2025-0025), borrower's signed acceptance was on a photocopy of the sanction letter rather than the original. While the original sanction letter was on file, the acceptance signature should be on the original document as per internal procedures. Minor procedural gap with no material risk.",
    hasBmResponse: false,
  },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  MAIN                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

async function seedLifecycle() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  AEGIS — Seed Full Audit Lifecycle                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  /* ─── Resolve tenant ─────────────────────────────────────────────────── */
  const flag = process.argv.find((a) => a.startsWith("--tenant-id="));
  let tenantId: string;
  if (flag) {
    tenantId = flag.split("=")[1];
  } else {
    const t = await prisma.tenant.findFirst({
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    });
    if (!t) throw new Error("No tenant found. Run pnpm db:seed first.");
    tenantId = t.id;
    console.log(`Tenant: ${t.name} (${t.id})\n`);
  }

  /* ─── Lookup existing records ────────────────────────────────────────── */
  console.log("Looking up existing records...");

  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true, email: true, name: true },
  });
  const u = (email: string) => {
    const user = users.find((u) => u.email === email);
    if (!user) throw new Error(`User not found: ${email}`);
    return user.id;
  };
  const priyaId = u("priya.sharma@apexbank.example"); // CAE
  const sureshId = u("suresh.patil@apexbank.example"); // Auditor / Lead
  const vikramId = u("vikram.kulkarni@apexbank.example"); // Auditee / Field
  const rajeshId = u("rajesh.deshmukh@apexbank.example"); // CEO
  const amitId = u("amit.joshi@apexbank.example"); // CCO

  const branches = await prisma.branch.findMany({
    where: { tenantId },
    select: { id: true, code: true },
  });
  const br = (code: string) => {
    const b = branches.find((b) => b.code === code);
    if (!b) throw new Error(`Branch not found: ${code}`);
    return b.id;
  };
  const kothrudId = br("BR002");
  const shivajiId = br("BR003");

  const q3Plan = await prisma.auditPlan.findFirst({
    where: { tenantId, year: 2025, quarter: "Q3_OCT_DEC" },
    select: { id: true },
  });
  if (!q3Plan)
    throw new Error("Q3 2025 audit plan not found. Run pnpm db:seed first.");

  const creditArea = await prisma.auditArea.findFirst({
    where: { tenantId, name: "Credit Risk" },
    select: { id: true },
  });
  const opsArea = await prisma.auditArea.findFirst({
    where: { tenantId, name: "Operational Risk" },
    select: { id: true },
  });
  if (!creditArea || !opsArea) throw new Error("Audit areas not found.");

  const examNodes = await prisma.examinationNode.findMany({
    where: { tenantId, code: { startsWith: "CRD-HLN" } },
    select: {
      id: true,
      code: true,
      name: true,
      depth: true,
      isLeaf: true,
      weight: true,
      isCritical: true,
      parentId: true,
    },
  });
  const nodeByCode = new Map(examNodes.map((n) => [n.code, n]));
  if (!nodeByCode.has("CRD-HLN"))
    throw new Error(
      "CRD-HLN examination node not found. Run seed-rbia-housing first.",
    );

  const auditModule = await prisma.auditModule.findUnique({
    where: { tenantId_code: { tenantId, code: "CRD-HLN" } },
    select: { id: true },
  });
  if (!auditModule)
    throw new Error(
      "CRD-HLN AuditModule not found. Run seed-rbia-housing first.",
    );

  const examQuestions = await prisma.examinationQuestion.findMany({
    where: { tenantId, moduleId: auditModule.id, isActive: true },
    select: { id: true, text: true, category: true },
    orderBy: { displayOrder: "asc" },
  });
  if (examQuestions.length === 0)
    throw new Error("No exam questions found. Run seed-exam-questions first.");

  const ramParams = await prisma.ramParameterConfig.findMany({
    where: { tenantId, isActive: true },
    select: { id: true, code: true },
    orderBy: { displayOrder: "asc" },
  });
  if (ramParams.length === 0)
    throw new Error("No RAM parameters found. Run pnpm db:seed first.");

  const circulars = await prisma.rbiCircular.findMany({
    select: { id: true, circularNumber: true },
  });
  const circularByNum = new Map(circulars.map((c) => [c.circularNumber, c.id]));

  console.log(
    `  ✓ ${users.length} users, ${branches.length} branches, ${examNodes.length} exam nodes, ${examQuestions.length} questions, ${ramParams.length} RAM params, ${circulars.length} RBI circulars\n`,
  );

  /* ─── Cleanup previous lifecycle data ────────────────────────────────── */
  console.log("Cleaning up previous lifecycle data...");

  // Delete observations first (cascades timeline, compliance, rbiCirculars, auditeeResponses)
  const delObs = await prisma.observation.deleteMany({
    where: { id: { in: ID.obs } },
  });
  // Delete engagements (cascades most child records)
  const delEng = await prisma.auditEngagement.deleteMany({
    where: { id: { in: [ID.eng1, ID.eng2] } },
  });
  // Delete standalone records
  await prisma.boardReport.deleteMany({ where: { id: ID.board } });
  await prisma.dashboardSnapshot.deleteMany({ where: { id: { in: ID.snap } } });
  await prisma.auditLog.deleteMany({ where: { id: { in: ID.log } } });
  await prisma.userBranchAssignment.deleteMany({
    where: { id: { in: ID.uba } },
  });
  await prisma.ramAssessment.deleteMany({ where: { id: ID.ram } });

  console.log(
    `  ✓ Cleaned ${delObs.count} observations, ${delEng.count} engagements\n`,
  );

  /* ═════════════════════════════════════════════════════════════════════── */
  /*  PHASE 1: Pre-Audit — RAM Assessment                                  */
  /* ═════════════════════════════════════════════════════════════════════── */
  console.log("Phase 1: RAM Assessment...");

  const ramScores: Array<{ code: string; score: number }> = [
    { code: "BR-01", score: 4 },
    { code: "BR-02", score: 3.5 },
    { code: "BR-03", score: 3 },
    { code: "BR-04", score: 4.5 },
    { code: "BR-05", score: 4 },
    { code: "BR-06", score: 3.5 },
    { code: "BR-07", score: 3 },
    { code: "BR-08", score: 3 },
    { code: "BR-09", score: 3.5 },
    { code: "BR-10", score: 4 },
    { code: "CR-01", score: 4 },
    { code: "CR-02", score: 4.5 },
    { code: "CR-03", score: 3.5 },
    { code: "CR-04", score: 4 },
    { code: "CR-05", score: 3 },
    { code: "CR-06", score: 3.5 },
    { code: "CR-07", score: 4 },
    { code: "CR-08", score: 3.5 },
    { code: "CR-09", score: 4 },
  ];

  await prisma.ramAssessment.create({
    data: {
      id: ID.ram,
      tenantId,
      branchId: kothrudId,
      assessmentYear: "2025-26",
      compositeScore: 3.8,
      rawCompositeScore: 3.6,
      riskCategory: "HIGH",
      auditFrequency: 12,
      repeatUpliftApplied: true,
      repeatFindingCount: 2,
      status: "APPROVED",
      computedById: priyaId,
      computedAt: d("2025-09-15T10:00:00Z"),
      approvedById: rajeshId,
      approvedAt: d("2025-09-18T14:00:00Z"),
      scores: {
        create: ramScores.map((rs) => {
          const param = ramParams.find((p) => p.code === rs.code);
          if (!param) throw new Error(`RAM param not found: ${rs.code}`);
          return { paramConfigId: param.id, score: rs.score, remarks: null };
        }),
      },
    },
  });

  // Update branch RAM score
  await prisma.branch.update({
    where: { id: kothrudId },
    data: { ramScore: 3.8, auditFrequency: 12 },
  });

  console.log("  ✓ RAM assessment created (composite 3.80 → HIGH)\n");

  /* ═════════════════════════════════════════════════════════════════════── */
  /*  PHASE 2: Engagement Setup                                            */
  /* ═════════════════════════════════════════════════════════════════════── */
  console.log("Phase 2: Engagement Setup...");

  await prisma.auditEngagement.create({
    data: {
      id: ID.eng1,
      auditPlanId: q3Plan.id,
      tenantId,
      branchId: kothrudId,
      auditAreaId: creditArea.id,
      assignedToId: priyaId,
      status: "COMPLETED",
      auditNumber: "RBIA/2025-26/BR-002/V1",
      auditType: "RBIA",
      visitNumber: 1,
      periodFrom: d("2025-04-01"),
      periodTo: d("2025-09-30"),
      scheduledStartDate: d("2025-10-15"),
      completionDate: d("2025-12-22"),
      actualStartDate: d("2025-10-15"),
      actualEndDate: d("2025-12-20"),
      overallRiskRating: "GOOD",
      bhCertSignedById: vikramId,
      bhCertSignedAt: d("2025-10-15T09:00:00Z"),
      bhCertComments:
        "Branch records and systems made available for audit. All requested documents provided. Staff cooperation satisfactory.",
      bhCertCountersignedById: sureshId,
      bhCertCountersignedAt: d("2025-10-15T09:30:00Z"),
      reportStatus: "ISSUED",
      reportReviewedById: priyaId,
      reportReviewedAt: d("2025-12-26T10:00:00Z"),
      reportApprovedById: priyaId,
      reportApprovedAt: d("2025-12-28T14:00:00Z"),
      reportIssuedById: priyaId,
      reportIssuedAt: d("2026-01-02T10:00:00Z"),
      hiaClosedById: priyaId,
      hiaClosedAt: d("2026-01-05T11:00:00Z"),
      closureRemarks:
        "Audit completed. 6 formal observations issued. 12 action points raised. Branch rated GOOD with composite RBIA score of 0.78. Key concerns around sanctioning authority violations and NPA provisioning shortfall referred to ACE/ACB for regulatory oversight. BM response deadline set for 17-Jan-2026.",
      allItemsResolved: false,
    },
  });

  // Team members
  await prisma.auditTeamMember.createMany({
    data: [
      {
        id: ID.teamLead,
        tenantId,
        engagementId: ID.eng1,
        userId: sureshId,
        roleInEngagement: "LEAD_AUDITOR",
        assignedSections: ["CRD-HLN-SAN", "CRD-HLN-MON", "CRD-HLN-REG"],
      },
      {
        id: ID.teamField,
        tenantId,
        engagementId: ID.eng1,
        userId: vikramId,
        roleInEngagement: "FIELD_AUDITOR",
        assignedSections: ["CRD-HLN-PRE", "CRD-HLN-DOC", "CRD-HLN-DIS"],
      },
    ],
  });

  // Module selection
  await prisma.engagementModule.create({
    data: {
      id: ID.modSel,
      tenantId,
      engagementId: ID.eng1,
      moduleId: auditModule.id,
      isAutoSelected: true,
      selectionReason: "Branch type: BRANCH — Housing Loans module applicable",
    },
  });

  console.log("  ✓ Engagement RBIA/2025-26/BR-002/V1 created (COMPLETED)\n");

  /* ═════════════════════════════════════════════════════════════════════── */
  /*  PHASE 3: Audit Execution                                             */
  /* ═════════════════════════════════════════════════════════════════════── */
  console.log("Phase 3: Audit Execution...");

  // 3a. Examination Responses (23 leaf nodes)
  console.log("  Creating examination responses...");
  for (const s of SCORES) {
    const node = nodeByCode.get(s.code);
    if (!node) throw new Error(`Node not found: ${s.code}`);
    await prisma.examinationResponse.create({
      data: {
        id: uid(`er:${s.code}`),
        tenantId,
        engagementId: ID.eng1,
        nodeId: node.id,
        score: s.score,
        scoreLabel: s.label as any,
        remarks: s.notes || null,
        flagForObservation: s.flag?.includes("obs") ?? false,
        flagForActionPoint: s.flag?.includes("ap") ?? false,
        respondedById:
          s.code.startsWith("CRD-HLN-PRE") ||
          s.code.startsWith("CRD-HLN-DOC") ||
          s.code.startsWith("CRD-HLN-DIS")
            ? vikramId
            : sureshId,
        respondedAt: d("2025-12-18T16:00:00Z"),
      },
    });
  }
  console.log(`    ✓ ${SCORES.length} examination responses`);

  // 3b. Population records (50 housing-loan accounts)
  console.log("  Creating population records...");
  const loanIds: string[] = [];
  const sampledIndices = [0, 5, 10, 15, 20, 25, 35, 40, 47, 49]; // mix of asset classes
  for (let i = 0; i < 50; i++) {
    const { assetClass, dpd } = assetInfo(i);
    const sanction = loanAmount(i);
    const outstanding = Math.round(sanction * (0.6 + (i % 4) * 0.1));
    const isSampled = sampledIndices.includes(i);
    const acctNo = `HL-KTH-2025-${String(i + 1).padStart(4, "0")}`;
    await prisma.populationRecord.create({
      data: {
        id: ID.loan[i],
        tenantId,
        engagementId: ID.eng1,
        branchId: kothrudId,
        moduleId: auditModule.id,
        recordKey: acctNo,
        displayName: `${FIRST_NAMES[i]} ${LAST_NAMES[i]}`,
        amount: outstanding,
        date: d(
          `${2020 + (i % 5)}-${String((i % 12) + 1).padStart(2, "0")}-15`,
        ),
        classification: assetClass,
        isSampled,
        sampledAt: isSampled ? d("2025-11-05T10:00:00Z") : null,
        metadata: {
          productType: PRODUCTS[i % PRODUCTS.length],
          sanctionAmount: sanction,
          dpd,
          ltvRatio: 70 + (i % 20),
          interestRate: 8.5 + (i % 10) * 0.1,
          tenure: 120 + (i % 12) * 12,
        },
      },
    });
    if (isSampled) loanIds.push(ID.loan[i]);
  }
  console.log("    ✓ 50 population records (10 sampled)");

  // 3c. Sampling Config
  await prisma.samplingConfig.create({
    data: {
      id: ID.sampling,
      tenantId,
      engagementId: ID.eng1,
      moduleId: auditModule.id,
      sampleSizePct: 20.0,
      criteriaBuckets: [
        {
          bucket: "HIGH_VALUE",
          pct: 30,
          description: "Loans above Rs.25 lakh",
        },
        {
          bucket: "NPA_SMA",
          pct: 30,
          description: "Non-performing and stressed accounts",
        },
        {
          bucket: "RECENT_SANCTION",
          pct: 20,
          description: "Sanctioned in last 12 months",
        },
        {
          bucket: "RANDOM",
          pct: 20,
          description: "Random selection from remaining portfolio",
        },
      ],
      isLocked: true,
      lockedAt: d("2025-11-05T10:30:00Z"),
      lockedById: priyaId,
      sampleGenerated: true,
      sampleGeneratedAt: d("2025-11-05T10:30:00Z"),
      sampleCount: 10,
      createdById: sureshId,
    },
  });
  console.log("    ✓ Sampling config (20%, 4 criteria buckets, locked)");

  // 3d. Account Exam Responses (10 sampled × N questions)
  console.log("  Creating account exam responses...");
  let aerCount = 0;
  for (let ai = 0; ai < loanIds.length; ai++) {
    const loanId = loanIds[ai];
    const accountIdx = sampledIndices[ai];
    const { assetClass } = assetInfo(accountIdx);
    const isStressed = !["STANDARD"].includes(assetClass);

    for (let qi = 0; qi < examQuestions.length; qi++) {
      const q = examQuestions[qi];
      // Higher violation rate for stressed accounts
      const violationChance = isStressed ? 0.35 : 0.12;
      const isViolation =
        ((ai * 31 + qi * 7 + 13) % 100) / 100 < violationChance;
      const status = isViolation ? "VIOLATION" : "COMPLIANT";
      const note = isViolation
        ? `Finding: ${q.category || "General"} check failed for this account. Specific gap identified during detailed examination requiring corrective action by branch.`
        : null;

      await prisma.accountExamResponse.create({
        data: {
          id: uid(`aer:${ai}-${qi}`),
          tenantId,
          engagementId: ID.eng1,
          recordId: loanId,
          questionId: q.id,
          status: status as any,
          note,
          respondedById: ai < 5 ? vikramId : sureshId,
          respondedAt: d("2025-12-15T14:00:00Z"),
        },
      });
      aerCount++;
    }
  }
  console.log(`    ✓ ${aerCount} account exam responses`);

  // 3e. Action Points (12)
  console.log("  Creating action points...");
  for (let i = 0; i < ACTION_POINTS.length; i++) {
    const ap = ACTION_POINTS[i];
    const sourceNode = SCORES.find(
      (s) => s.code.startsWith(ap.moduleCode) && s.flag?.includes("ap"),
    );
    await prisma.actionPoint.create({
      data: {
        id: ID.ap[i],
        tenantId,
        engagementId: ID.eng1,
        branchId: kothrudId,
        serialNo: i + 1,
        title: ap.title,
        description: ap.description,
        severity: ap.severity as any,
        moduleCode: ap.moduleCode,
        sourceResponseId: sourceNode ? uid(`er:${sourceNode.code}`) : null,
        status: "ISSUED",
        bmResponseText: ap.hasBmResponse
          ? `Branch acknowledges the observation. Corrective measures have been initiated. ${ap.severity === "CRITICAL" ? "This has been escalated to the Zonal Manager for immediate remediation. Revised procedures will be implemented within 30 days." : "Expected completion within the stipulated deadline."}`
          : null,
        bmResponseDate: ap.hasBmResponse ? d("2026-01-10T10:00:00Z") : null,
        bmResponseDeadline: d("2026-01-17T23:59:00Z"),
        createdById: sureshId,
      },
    });
  }
  const respondedCount = ACTION_POINTS.filter((a) => a.hasBmResponse).length;
  console.log(`    ✓ 12 action points (${respondedCount} with BM responses)`);

  // 3f. SMA/NPA Entries (6)
  const smaData = [
    { category: "SMA0", accountCount: 5, totalAmount: 4850000 },
    { category: "SMA1", accountCount: 4, totalAmount: 7200000 },
    { category: "SMA2", accountCount: 3, totalAmount: 6100000 },
    { category: "NPA_SUB_STANDARD", accountCount: 2, totalAmount: 4500000 },
    { category: "NPA_DOUBTFUL", accountCount: 1, totalAmount: 3200000 },
    { category: "NPA_LOSS", accountCount: 0, totalAmount: 0 },
  ];
  await prisma.smaNpaEntry.createMany({
    data: smaData.map((s, i) => ({
      id: ID.sma[i],
      tenantId,
      engagementId: ID.eng1,
      category: s.category,
      accountCount: s.accountCount,
      totalAmount: s.totalAmount,
      remarks:
        s.accountCount > 0
          ? `${s.category} classification as per CBS DPD-based auto-classification. Verified against branch records.`
          : "No accounts in this category.",
    })),
  });
  console.log("    ✓ 6 SMA/NPA entries");

  // 3g. Meetings
  await prisma.engagementMeeting.createMany({
    data: [
      {
        id: ID.meetOpen,
        tenantId,
        engagementId: ID.eng1,
        meetingType: "OPENING",
        meetingDate: d("2025-10-15T10:00:00Z"),
        attendees: [
          {
            name: "Suresh Patil",
            role: "Lead Auditor",
            designation: "Senior Auditor",
          },
          {
            name: "Vikram Kulkarni",
            role: "Field Auditor",
            designation: "Auditor",
          },
          {
            name: "Kothrud Branch Manager",
            role: "Auditee",
            designation: "Branch Manager",
          },
          {
            name: "Kothrud Operations Head",
            role: "Auditee",
            designation: "Operations Manager",
          },
        ],
        minutesText:
          "Opening meeting for RBIA audit of Kothrud Branch housing loan portfolio. Audit scope covers FY2025-26 H1 (Apr-Sep 2025). Key areas: pre-sanction, documentation, sanctioning, disbursement, monitoring, and regulatory compliance. Branch to provide access to all loan files, CBS reports, and regulatory returns. Audit timeline: Oct 15 – Dec 20, 2025.",
        keyDiscussionPoints:
          "1. Audit scope and timeline communicated\n2. Branch to provide pending loan files by Oct 17\n3. CBS access credentials shared with audit team\n4. Previous audit observations status reviewed — 2 repeat findings noted",
        signedOff: true,
        signedOffById: sureshId,
        signedOffAt: d("2025-10-15T11:00:00Z"),
      },
      {
        id: ID.meetExit,
        tenantId,
        engagementId: ID.eng1,
        meetingType: "EXIT",
        meetingDate: d("2025-12-20T14:00:00Z"),
        attendees: [
          {
            name: "Suresh Patil",
            role: "Lead Auditor",
            designation: "Senior Auditor",
          },
          {
            name: "Vikram Kulkarni",
            role: "Field Auditor",
            designation: "Auditor",
          },
          {
            name: "Priya Sharma",
            role: "Head of Internal Audit",
            designation: "CAE",
          },
          {
            name: "Kothrud Branch Manager",
            role: "Auditee",
            designation: "Branch Manager",
          },
          {
            name: "Zonal Manager West",
            role: "Zonal Manager",
            designation: "AGM",
          },
        ],
        minutesText:
          "Exit meeting for RBIA audit of Kothrud Branch. Preliminary findings presented: 2 critical, 3 high, 4 medium, 3 low severity action points. 6 formal observations to be issued covering sanctioning authority violations, NPA provisioning gaps, KYC documentation, SMA classification delays, incomplete credit appraisal reviews, and insurance lapses. Branch overall rating: GOOD (RBIA composite 0.78). BM response deadline: 15 days from report issuance.",
        keyDiscussionPoints:
          "1. 12 action points presented — BM acknowledged findings\n2. 2 critical observations will be escalated to ACE/ACB\n3. NPA provisioning shortfall of Rs.3.2L to be rectified immediately\n4. BM committed to completing pending annual reviews within 60 days\n5. Sanctioning authority compliance — branch to implement dual-sign checklist",
        signedOff: true,
        signedOffById: priyaId,
        signedOffAt: d("2025-12-20T16:00:00Z"),
      },
    ],
  });
  console.log("    ✓ 2 engagement meetings (OPENING + EXIT)");

  console.log("  Phase 3 complete.\n");

  /* ═════════════════════════════════════════════════════════════════════── */
  /*  PHASE 4: Score Freeze & BM Response Batch                            */
  /* ═════════════════════════════════════════════════════════════════════── */
  console.log("Phase 4: Score Freeze...");

  // Build scoring tree snapshot matching freeze.ts format
  function buildTree() {
    const rootNode = nodeByCode.get("CRD-HLN")!;
    const subModules = examNodes
      .filter((n) => n.depth === 2)
      .sort((a, b) => a.code.localeCompare(b.code));
    const children = subModules.map((sm) => {
      const leaves = examNodes.filter(
        (n) => n.depth === 3 && n.parentId === sm.id,
      );
      const leafChildren = leaves.map((leaf) => {
        const scoreEntry = SCORES.find((s) => s.code === leaf.code);
        return {
          nodeId: leaf.id,
          code: leaf.code,
          name: leaf.name,
          weight: Number(leaf.weight),
          isCritical: leaf.isCritical,
          isLeaf: true,
          scoreLabel: scoreEntry?.label ?? null,
          children: [],
        };
      });
      // Compute sub-module score (average of leaf scores)
      const leafScores = leafChildren
        .filter((l) => l.scoreLabel !== null)
        .map((l) => {
          const s = SCORES.find((sc) => sc.code === l.code);
          return s?.score ?? 0;
        });
      const smScore =
        leafScores.length > 0
          ? leafScores.reduce((a, b) => a + b, 0) / leafScores.length
          : 0;
      const smLabel =
        smScore >= 0.875
          ? "FULLY_COMPLIANT"
          : smScore >= 0.625
            ? "LARGELY_COMPLIANT"
            : smScore >= 0.375
              ? "PARTIALLY_COMPLIANT"
              : "NON_COMPLIANT";
      return {
        nodeId: sm.id,
        code: sm.code,
        name: sm.name,
        weight: Number(sm.weight),
        isCritical: sm.isCritical,
        isLeaf: false,
        scoreLabel: smLabel,
        children: leafChildren,
      };
    });

    return [
      {
        nodeId: rootNode.id,
        code: rootNode.code,
        name: rootNode.name,
        weight: 1.0,
        isCritical: false,
        isLeaf: false,
        scoreLabel: "LARGELY_COMPLIANT",
        children,
      },
    ];
  }

  const tree = buildTree();
  const moduleScores: Record<string, number> = { "CRD-HLN": 0.78 };

  await prisma.branchRbiaScore.create({
    data: {
      id: ID.score,
      tenantId,
      engagementId: ID.eng1,
      branchId: kothrudId,
      compositeScore: 0.78,
      ratingBand: "GOOD",
      moduleScores,
      scoringTreeSnapshot: tree,
      frozenAt: d("2025-12-22T10:00:00Z"),
      frozenById: priyaId,
    },
  });

  // BM Response Batch
  await prisma.bmResponseBatch.create({
    data: {
      id: ID.batch,
      tenantId,
      engagementId: ID.eng1,
      totalActionPoints: 12,
      respondedActionPoints: respondedCount,
      deadline: d("2026-01-17T23:59:00Z"),
      status: "PENDING",
    },
  });

  // Update branch
  await prisma.branch.update({
    where: { id: kothrudId },
    data: { lastAuditDate: d("2025-12-22"), lastAuditRating: "GOOD" },
  });

  console.log("  ✓ Score frozen (0.78 → GOOD), BM batch created\n");

  /* ═════════════════════════════════════════════════════════════════════── */
  /*  PHASE 5: Observations — 6 Formal 5C Findings                        */
  /* ═════════════════════════════════════════════════════════════════════── */
  console.log("Phase 5: Observations...");

  const observations: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    criteria: string;
    condition: string;
    cause: string;
    effect: string;
    recommendation: string;
    riskCategory: string;
    circulars: string[];
    assignedToId: string;
    dueDate: string;
    responseDueDate: string;
  }> = [
    {
      id: ID.obs[0],
      title:
        "Sanctioning authority exceeded in housing loan accounts without committee approval",
      severity: "CRITICAL",
      status: "ISSUED",
      criteria:
        "Board-approved Delegation of Powers circular dated 15-Mar-2024 mandates dual-signature sanction for housing loans above Rs.25 lakh, requiring co-signature from AGM-level or higher authority. RBI Master Direction on Loans and Advances (DoR.STR.REC.9/21.04.048/2023-24) stipulates that UCBs must have a well-defined loan approval process with appropriate authority levels commensurate with the exposure size. Section 7.2 of the bank's Credit Policy Manual requires committee-level approval for individual exposures exceeding the Branch Manager's delegated limit.",
      condition:
        "In 4 of 10 sampled housing loan accounts (40% non-compliance rate), the sanctioning authority was exceeded without obtaining requisite committee-level approval. Specifically: (a) Account HL-KTH-2025-0003 — Rs.45 lakh sanctioned by Branch Manager alone, exceeding the Rs.25 lakh individual limit by Rs.20 lakh; (b) Account HL-KTH-2025-0012 — Rs.38 lakh sanctioned without co-signature from AGM despite requirement under Section 4.3 of the Delegation circular; (c) Account HL-KTH-2025-0037 — Rs.52 lakh sanctioned without committee approval, the highest individual breach observed; (d) Account HL-KTH-2025-0048 — Rs.41 lakh sanctioned by single official without deviation approval documentation. The aggregate exposure sanctioned without proper authority totals Rs.1.76 crore across these four accounts. The four-eyes principle was violated in all four cases — no independent verification of sanction authority was performed at any stage.",
      cause:
        "Root cause analysis indicates three contributing factors: (1) The branch CBS system does not enforce delegation of powers limits — sanction can proceed without system-level authority validation, allowing single-user approval regardless of amount; (2) The Branch Manager's interpretation of delegation limits was incorrect — he understood the limit to apply to the unsecured portion only rather than the total exposure, a misreading of the circular; (3) Absence of a pre-disbursement compliance checkpoint that would flag authority breaches before fund release. The branch operations team confirmed that no exception or deviation register was maintained during the audit period.",
      effect:
        "Exposure of Rs.1.76 crore sanctioned without proper authority represents a governance failure that could expose the bank to regulatory action under Section 46 of the Banking Regulation Act, 1949 (AACS). If any of these accounts become non-performing, the bank may face difficulty in recovery proceedings due to potential legal challenges regarding sanctioning authority. The non-compliance also reflects poorly on the bank's internal control environment during any RBI inspection or statutory audit review.",
      recommendation:
        "1. Implement system-level delegation of powers enforcement in the CBS — all sanction requests exceeding the individual delegated limit should be auto-routed to the next authority level with mandatory dual-sign-off workflow. 2. Conduct immediate remedial sanction ratification by the appropriate committee for all four identified accounts. 3. Issue a clarificatory circular to all branches restating the delegation limits and their applicability to total exposure (not merely unsecured portion). 4. Institute monthly compliance reporting by branches on sanctions exceeding Rs.15 lakh to the Loan Committee, enabling early detection of authority breaches.",
      riskCategory: "CREDIT",
      circulars: ["RBI/2023-24/075"],
      assignedToId: sureshId,
      dueDate: "2026-03-31",
      responseDueDate: "2026-01-17",
    },
    {
      id: ID.obs[1],
      title:
        "NPA provisioning shortfall and unauthorized CBS override preventing NPA classification",
      severity: "CRITICAL",
      status: "ISSUED",
      criteria:
        "RBI Master Direction on Income Recognition, Asset Classification and Provisioning (DoR.STR.REC.12/21.04.048/2023-24) — Section 4.2 mandates that an asset where interest and/or instalment of principal has remained overdue for 90 days or more shall be classified as NPA. Section 7.1 prescribes minimum provisioning rates: Sub-Standard (15%), Doubtful up to 1 year (25%), Doubtful 1-3 years (40%), Doubtful over 3 years (100%), Loss assets (100%). The bank's internal NPA Management Policy para 3.4 requires that CBS-driven NPA classification shall not be manually overridden without written authorization from the competent authority (AGM or above), and any such override must be reported to the Board within 30 days.",
      condition:
        "Three distinct deficiencies identified in NPA recognition and provisioning: (a) Account HL-KTH-2025-0049 with DPD of 120 days has NOT been classified as NPA in the CBS system — investigation revealed that a branch staff member applied a manual override to prevent automatic NPA flagging, claiming a restructuring application was pending. However, no formal restructuring proposal was submitted to the competent authority, no Board resolution for restructuring exists, and the override was applied without written authorization or documented justification; (b) Two NPA-Sub Standard accounts are provisioned at 10% instead of the required 15%, resulting in under-provisioning of approximately Rs.1.35 lakh; (c) Account HL-KTH-2025-0050 (DPD 400 days, NPA vintage 18 months) categorized as Doubtful-II is provisioned at 25% instead of the required 40%, resulting in under-provisioning of approximately Rs.1.85 lakh. Total provisioning shortfall across the housing loan portfolio: Rs.3.2 lakh.",
      cause:
        "The primary cause is inadequate system controls around NPA classification overrides — the CBS allows manual override of the DPD-based auto-classification without requiring multi-level authorization or generating an exception report. Branch staff applied the override based on an informal verbal understanding with the borrower about restructuring, which was never formalized through proper channels. The provisioning shortfall stems from the use of outdated provisioning rates in the CBS parameter table — the system was configured with pre-2024 rates and not updated when the RBI revised minimum provisioning norms. Additionally, the month-end NPA review process at the branch level lacks adequate scrutiny of override transactions.",
      effect:
        "The Rs.3.2 lakh provisioning shortfall directly understates the bank's provision requirements and overstates reported profit. The unauthorized NPA override for account HL-KTH-2025-0049 constitutes regulatory non-compliance that could attract penalties under Section 47A of the Banking Regulation Act. If this pattern of manual overrides is found to be prevalent across branches, it could indicate systemic asset quality misrepresentation — a finding that typically triggers enhanced supervisory scrutiny including possible RBI inspection. The non-classification also impacts the accuracy of CRILC and SMA reporting to RBI.",
      recommendation:
        "1. Immediately rectify the NPA classification for account HL-KTH-2025-0049 and apply correct provisioning. 2. Update the CBS provisioning parameter table to reflect current RBI-mandated rates, and implement quarterly verification of provisioning parameters against latest RBI directions. 3. Implement CBS-level controls requiring AGM-level authorization for any NPA classification override, with automatic exception reporting to Head Office. 4. Rectify provisioning for all under-provisioned accounts and pass the necessary provision entries in the current quarter. 5. Conduct a bank-wide review of NPA override transactions across all branches to identify any similar instances.",
      riskCategory: "CREDIT",
      circulars: ["RBI/2023-24/089"],
      assignedToId: sureshId,
      dueDate: "2026-02-28",
      responseDueDate: "2026-01-17",
    },
    {
      id: ID.obs[2],
      title:
        "Delayed CRILC reporting and inadequate early warning signal monitoring",
      severity: "HIGH",
      status: "ISSUED",
      criteria:
        "RBI circular on Central Repository of Information on Large Credits (CRILC) requires UCBs to report borrower-wise data on credit exposures of Rs.5 crore and above on a quarterly basis, and SMA-2 classification on a weekly basis within the prescribed timeline. RBI Master Direction on Income Recognition, Asset Classification and Provisioning requires banks to identify early warning signals for potential stress in borrower accounts and take proactive corrective measures. The bank's SMA Monitoring Policy (approved by Board on 01-Apr-2025) requires weekly review meetings with documented minutes for all SMA-1 and SMA-2 accounts.",
      condition:
        "Two SMA-2 accounts in the housing loan portfolio had CRILC reporting delayed beyond the prescribed weekly timeline — one by 5 days and another by 8 days. In addition, the early warning signal monitoring framework, while formally established through the Board-approved policy, was found to be inadequately implemented at the branch level: (a) One SMA-1 account (HL-KTH-2025-0045) that subsequently slipped to NPA had no documented evidence of proactive restructuring dialogue or remedial measures being attempted before the 90-day threshold was crossed; (b) Weekly SMA review meetings were not conducted as prescribed — the branch could produce minutes for only 6 of the 13 weeks during the audit period; (c) No documented escalation to the Zonal Manager was initiated for the SMA-2 accounts despite the policy requiring escalation within 7 days of SMA-2 classification.",
      cause:
        "The CRILC reporting delay stems from manual data collation and validation processes at the branch level — the current workflow requires branch staff to manually verify SMA data extracted from CBS before transmitting to Head Office for consolidated reporting. The inadequate EWS monitoring is attributable to the absence of automated alerts from CBS for SMA status changes and a reliance on manual register-based tracking that breaks down during staff leave periods. The branch had a staff vacancy in the Advances section during October-November 2025 which impacted routine monitoring activities.",
      effect:
        "Delayed CRILC reporting constitutes regulatory non-compliance that may be flagged during RBI inspection. Inadequate early warning signal monitoring resulted in at least one account slipping from SMA-1 to NPA without any documented remedial intervention, potentially converting a recoverable stress situation into a non-performing asset. The pattern of incomplete weekly reviews suggests systemic weakness in credit monitoring at this branch.",
      recommendation:
        "1. Automate CRILC data extraction and reporting from CBS to eliminate manual delays and data quality issues. 2. Implement automated SMS/email alerts to branch heads and the Advances section upon SMA-1 and SMA-2 classification of any account. 3. Make weekly SMA review meetings mandatory with centralized tracking by the Credit Department at Head Office — require submission of minutes within 2 working days. 4. Establish a mandatory escalation matrix: SMA-1 accounts to be reported to Zonal Manager within 48 hours, SMA-2 accounts to trigger remedial action plan within 7 days.",
      riskCategory: "CREDIT",
      circulars: ["RBI/2023-24/089"],
      assignedToId: sureshId,
      dueDate: "2026-03-15",
      responseDueDate: "2026-01-17",
    },
    {
      id: ID.obs[3],
      title:
        "Multiple fair practices code violations — vernacular MITC, grievance redressal, and complaint management",
      severity: "HIGH",
      status: "ISSUED",
      criteria:
        "RBI Master Direction on Fair Practices Code (DoR.MCS.REC.2/01.01.001/2023-24) mandates: (a) All key terms and conditions of the loan including MITC to be communicated in the language understood by the borrower (Section 3.2); (b) Display of grievance redressal mechanism details including the name of the nodal officer at all branch premises (Section 7.1); (c) Maintenance of a customer complaint register with tracking of resolution timelines (Section 7.3); (d) Resolution of all customer complaints within 30 days of receipt. The bank's Customer Service Policy (Board-approved, dated 01-Jul-2025) requires branch-level complaint tracking with monthly MIS to the Customer Service Committee.",
      condition:
        "Three categories of fair practices code violations identified: (a) Most Important Terms and Conditions (MITC) not provided in Marathi for 6 of 10 sampled borrowers despite the branch operating in Pune, a predominantly Marathi-speaking area. All 6 borrowers had Marathi recorded as their preferred language in the KYC form, yet MITC was provided only in English. The vernacular MITC template approved by the Board was available in the branch system but not being used for housing loan documentation; (b) Grievance redressal mechanism details not displayed at the branch — the designated nodal officer's name and contact information were absent from the notice board, and the mandatory display board near the entrance did not contain the prescribed grievance escalation hierarchy; (c) Two customer complaints regarding delayed foreclosure processing were received on 15-Oct-2025 and 22-Oct-2025 respectively, and remained unresolved as of the audit date (20-Dec-2025), exceeding the 30-day TAT by 36 and 29 days respectively. The branch does not maintain a complaint register as required — complaints are tracked informally through email exchanges with no centralized log.",
      cause:
        "The MITC vernacular gap arises from a process failure — while the Board approved Marathi MITC templates in July 2025, no implementation circular was issued to branches, and the documentation checklist used by the branch for loan processing was not updated to include the vernacular MITC requirement. The grievance display deficiency results from the branch not updating its notice board after a premises renovation in September 2025 — the previous display was removed during renovation and not reinstated. The complaint register gap indicates a training deficiency — the current Branch Manager (posted in June 2025) was not aware of the requirement for a physical complaint register separate from email-based tracking.",
      effect:
        "Fair practices code violations directly impact customer protection standards and may attract regulatory penalty under Section 46 of the BR Act. The MITC violation could expose the bank to legal risk if any borrower disputes loan terms, arguing lack of informed consent due to language barrier. The unresolved complaints could trigger adverse findings in RBI's banking ombudsman framework. Collectively, these violations indicate inadequate customer protection oversight at the branch level.",
      recommendation:
        "1. Immediately reinstate the grievance redressal display board with the current nodal officer details, and verify display compliance across all branches within 30 days. 2. Issue a circular mandating vernacular MITC issuance for all new loans, and retrospectively provide Marathi MITC to the 6 identified borrowers with acknowledgement. 3. Establish and maintain a physical customer complaint register at every branch in the prescribed format, with weekly entries to be verified by the branch head. 4. Resolve the two pending complaints within 7 days and submit resolution reports to the Customer Service Committee.",
      riskCategory: "COMPLIANCE",
      circulars: ["RBI/2023-24/075"],
      assignedToId: amitId,
      dueDate: "2026-02-15",
      responseDueDate: "2026-01-17",
    },
    {
      id: ID.obs[4],
      title:
        "KYC documentation deficiencies — co-applicant verification and guarantor assessment gaps",
      severity: "MEDIUM",
      status: "ISSUED",
      criteria:
        "RBI KYC/AML Master Direction (DoR.AML.REC.24/14.01.001/2023-24) requires comprehensive customer due diligence including verification of identity and address of all parties to the loan including co-applicants and guarantors. The bank's KYC Policy (Board-approved, revised January 2025) Section 4.5 mandates that credit bureau reports for all borrowers, co-applicants, and guarantors must be obtained within 30 days prior to sanction and must be on file at the time of disbursement. Section 4.8 requires independent assessment of guarantor creditworthiness including income verification.",
      condition:
        "KYC and documentation deficiencies identified in 5 of 10 sampled accounts across two categories: (a) Co-applicant CIBIL reports: Account HL-KTH-2025-0008 had co-applicant CIBIL pulled 45 days prior to sanction, exceeding the 30-day validity window by 15 days; Account HL-KTH-2025-0023 had co-applicant credit bureau report dated 42 days before sanction; Account HL-KTH-2025-0031 was entirely missing the guarantor's CIBIL report — the file contained a note stating 'guarantor report to follow' but it was never obtained before or after disbursement; (b) Guarantor verification: In 2 files (HL-KTH-2025-0031 and HL-KTH-2025-0038), guarantor KYC documentation was incomplete — one missing income proof (salary slip or ITR), the other missing address verification document. Guarantee deeds were executed in both cases, but the guarantors' financial capacity to honour the guarantee was not independently verified as required by policy.",
      cause:
        "The pre-sanction documentation checklist used by the branch does not include a separate verification step for co-applicant and guarantor CIBIL validity dates — the checklist only verifies primary borrower CIBIL. The branch follows an informal practice of collecting guarantor documentation 'at the time of documentation' rather than mandating it at appraisal stage, creating a gap between sanction and documentation. Staff turnover in the loan processing section resulted in continuity gaps in file completion follow-up.",
      effect:
        "Incomplete co-applicant and guarantor verification weakens the credit assessment quality of the housing loan portfolio. In the event of default, inadequate guarantor documentation could impair the bank's ability to enforce the guarantee. While no material credit risk was identified in these specific accounts (all primary borrowers have satisfactory CIBIL scores), the process gaps create systemic vulnerability that could be exploited in higher-risk cases.",
      recommendation:
        "1. Update the pre-sanction compliance checklist to include explicit verification of CIBIL validity dates for all parties (borrower, co-applicant, and guarantor) with rejection if the report is older than 30 days. 2. Make guarantor income verification a mandatory pre-disbursement condition — no disbursement to proceed until complete guarantor KYC and financial assessment is on file. 3. Implement a documentation deficiency tracker with automated escalation to the Branch Manager for any file incomplete beyond 7 days of sanction.",
      riskCategory: "COMPLIANCE",
      circulars: ["RBI/2023-24/075"],
      assignedToId: amitId,
      dueDate: "2026-03-31",
      responseDueDate: "2026-01-17",
    },
    {
      id: ID.obs[5],
      title: "Annual credit review overdue for self-employed borrower accounts",
      severity: "MEDIUM",
      status: "CLOSED",
      criteria:
        "The bank's Credit Review Policy (Board-approved, dated 01-Apr-2024) Section 5.2 mandates annual review of all term loan accounts where the borrower is self-employed, proprietorship, or partnership firm. The review must include updated financials, income verification, business viability assessment, and property revaluation on a 3-year cycle. RBI guidelines on prudential norms require banks to monitor credit quality on an ongoing basis.",
      condition:
        "Annual review was overdue for 4 of 10 sampled housing loan accounts — all involving self-employed or proprietorship borrowers: (a) HL-KTH-2025-0005 (self-employed professional, Rs.18 lakh outstanding) — last review conducted 18 months ago, overdue by 6 months; (b) HL-KTH-2025-0014 (proprietorship firm, Rs.22 lakh outstanding) — last review 22 months ago, overdue by 10 months; (c) HL-KTH-2025-0033 (partnership firm, Rs.28 lakh outstanding) — overdue by 6 months, no ITR obtained for FY2024-25; (d) HL-KTH-2025-0041 (self-employed professional, Rs.15 lakh outstanding) — last review 15 months ago. Additionally, property revaluation was pending for 2 accounts beyond the 3-year cycle — HL-KTH-2025-0005 (last valued in 2021) and HL-KTH-2025-0014 (last valued in 2022).",
      cause:
        "The branch does not have an automated review tracking system — annual review due dates are maintained in a manual register that was not consistently updated after staff transfers in August 2025. The incoming staff member was not briefed on pending review deadlines. For self-employed borrowers, the review process is more time-intensive as it requires obtaining updated financials directly from borrowers, leading to delays when borrowers are non-responsive. The property revaluation delays are attributed to limited availability of empanelled valuers in the Kothrud area and cost concerns raised by borrowers who are required to bear the revaluation fee.",
      effect:
        "Overdue annual reviews mean that changes in the financial condition of self-employed borrowers may go undetected, increasing the risk of asset quality deterioration without early warning. Outdated property valuations could result in the bank holding security with a lower-than-assumed market value, impacting the LTV ratio accuracy and recoverability in case of default. The combined outstanding exposure of the 4 accounts with overdue reviews is Rs.83 lakh.",
      recommendation:
        "1. Implement automated annual review alerts through CBS with 30-day advance notification to the branch and 15-day escalation to the Zonal Manager. 2. Complete all four pending annual reviews within 60 days and obtain updated ITRs and financial statements. 3. Commission property revaluation for the 2 overdue accounts within 30 days. 4. Ensure adequate briefing on pending review schedules during staff handover as part of the standard transfer protocol.",
      riskCategory: "CREDIT",
      circulars: [],
      assignedToId: sureshId,
      dueDate: "2026-02-28",
      responseDueDate: "2026-01-17",
    },
  ];

  for (const obs of observations) {
    await prisma.observation.create({
      data: {
        id: obs.id,
        tenantId,
        title: obs.title,
        severity: obs.severity as any,
        status: obs.status as any,
        criteria: obs.criteria,
        condition: obs.condition,
        cause: obs.cause,
        effect: obs.effect,
        recommendation: obs.recommendation,
        riskCategory: obs.riskCategory,
        observationType: "FORMAL",
        branchId: kothrudId,
        auditAreaId: creditArea.id,
        engagementId: ID.eng1,
        assignedToId: obs.assignedToId,
        createdById: sureshId,
        dueDate: d(obs.dueDate),
        responseDueDate: d(obs.responseDueDate),
      },
    });
  }
  console.log("  ✓ 6 formal observations (5C format)");

  // A LOW-severity observation parked in COMPLIANCE, so the E2E suite can
  // exercise the COMPLIANCE → CLOSED transition deterministically. The title is
  // matched verbatim by tests/e2e/observation-lifecycle.spec.ts.
  // Idempotent: remove any prior copy of this fixture (it has no fixed ID in
  // ID.obs, so the cleanup block above would not catch it).
  await prisma.observation.deleteMany({
    where: {
      tenantId,
      title: "E2E fixture: low severity awaiting closure",
    },
  });
  await prisma.observation.create({
    data: {
      tenantId,
      title: "E2E fixture: low severity awaiting closure",
      condition: "Register not initialled for two days",
      criteria: "Branch operations manual, clause 4.2",
      cause: "Officer on leave without a delegate",
      effect: "Minor control lapse",
      recommendation: "Nominate a standing delegate",
      severity: "LOW",
      status: "COMPLIANCE",
      branchId: kothrudId,
      auditAreaId: creditArea.id,
      createdById: sureshId,
      version: 1,
      // /findings renders only the 20 newest observations (getObservations
      // defaults to pageSize 20, ordered by createdAt desc) and the page has no
      // server-side filter or paging control. The E2E suite creates several
      // observations per Playwright project, so by the last project this
      // fixture — the oldest row — had been pushed off the only page the test
      // can see. Dating it forward keeps it first regardless of how many
      // observations a run creates. The trade-off is that this one row shows a
      // negative "Age (days)" in the UI; nothing asserts on that column.
      createdAt: new Date("2099-01-01T00:00:00.000Z"),
    },
  });
  console.log("  ✓ E2E COMPLIANCE fixture observation");

  // Timeline entries for each observation
  const timelineEvents: Array<{
    obsIdx: number;
    event: string;
    comment: string;
    userId: string;
    date: string;
    oldValue?: string;
    newValue?: string;
  }> = [
    // Obs 0 — sanctioning authority (CRITICAL → ACB_REVIEW)
    {
      obsIdx: 0,
      event: "created",
      comment:
        "Observation raised by Lead Auditor based on examination of sanctioning authority compliance. Four accounts identified exceeding Branch Manager's delegated limits totaling Rs.1.76 crore exposure. Classified as CRITICAL due to governance implications and regulatory risk.",
      userId: sureshId,
      date: "2025-12-20T10:00:00Z",
    },
    {
      obsIdx: 0,
      event: "status_change",
      oldValue: "DRAFT",
      newValue: "SUBMITTED",
      comment:
        "Submitted for HIA review after exit meeting discussion. BM acknowledged the findings but requested review of delegation circular interpretation.",
      userId: sureshId,
      date: "2025-12-22T09:00:00Z",
    },
    {
      obsIdx: 0,
      event: "status_change",
      oldValue: "SUBMITTED",
      newValue: "ISSUED",
      comment:
        "Reviewed and approved by HIA. Confirmed that delegation limits apply to total exposure, not unsecured portion. Observation to be escalated to ACE and ACB given the systemic nature and aggregate exposure exceeding Rs.1 crore.",
      userId: priyaId,
      date: "2025-12-28T14:30:00Z",
    },
    // Obs 1 — NPA provisioning (CRITICAL → ACE_REVIEW)
    {
      obsIdx: 1,
      event: "created",
      comment:
        "Observation raised following detailed NPA portfolio review. Manual CBS override for account HL-KTH-2025-0049 discovered during DPD reconciliation. Provisioning shortfall of Rs.3.2 lakh quantified across 3 accounts. Unauthorized override constitutes a significant control failure requiring immediate remediation.",
      userId: sureshId,
      date: "2025-12-19T15:00:00Z",
    },
    {
      obsIdx: 1,
      event: "status_change",
      oldValue: "DRAFT",
      newValue: "SUBMITTED",
      comment:
        "Submitted with supporting CBS screen captures showing override history and provisioning computation workpapers detailing the Rs.3.2 lakh shortfall across NPA-Sub and NPA-Doubtful categories.",
      userId: sureshId,
      date: "2025-12-22T11:00:00Z",
    },
    {
      obsIdx: 1,
      event: "status_change",
      oldValue: "SUBMITTED",
      newValue: "ISSUED",
      comment:
        "Approved by HIA with recommendation for immediate NPA rectification and provisioning adjustment in current quarter. CBS override controls to be strengthened bank-wide. Referred to ACE for regulatory compliance follow-up.",
      userId: priyaId,
      date: "2025-12-28T15:00:00Z",
    },
    // Obs 2 — SMA/CRILC (HIGH → ZAC_APPROVED)
    {
      obsIdx: 2,
      event: "created",
      comment:
        "Observation raised on CRILC reporting delays and EWS monitoring gaps. Two SMA-2 reporting delays (5 and 8 days) verified against RBI submission logs. Weekly review meeting minutes available for only 6 of 13 required weeks during audit period.",
      userId: sureshId,
      date: "2025-12-18T14:00:00Z",
    },
    {
      obsIdx: 2,
      event: "status_change",
      oldValue: "DRAFT",
      newValue: "ISSUED",
      comment:
        "Fast-tracked through review given established RBI timelines for CRILC reporting. HIA confirmed regulatory significance and directed compliance tracking.",
      userId: priyaId,
      date: "2025-12-26T10:00:00Z",
    },
    // Obs 3 — Fair practices (HIGH → ZAC_REJECTED for re-work)
    {
      obsIdx: 3,
      event: "created",
      comment:
        "Multiple fair practices code violations documented during branch visit. Physical inspection confirmed absence of grievance display board post-renovation. Sampled borrower files showed systematic non-issuance of vernacular MITC. Complaint register not maintained.",
      userId: sureshId,
      date: "2025-12-17T11:00:00Z",
    },
    {
      obsIdx: 3,
      event: "status_change",
      oldValue: "DRAFT",
      newValue: "ISSUED",
      comment:
        "Issued as HIGH severity given direct customer protection impact and potential regulatory penalty exposure under Section 46 of the BR Act.",
      userId: priyaId,
      date: "2025-12-26T11:00:00Z",
    },
    // Obs 4 — KYC gaps (MEDIUM)
    {
      obsIdx: 4,
      event: "created",
      comment:
        "KYC documentation deficiencies identified across 5 sampled accounts. Co-applicant CIBIL validity breaches in 2 accounts, missing guarantor CIBIL in 1 account, and incomplete guarantor KYC in 2 accounts. While primary borrower verification was satisfactory in all cases, the co-applicant and guarantor gaps represent process weaknesses.",
      userId: vikramId,
      date: "2025-12-16T16:00:00Z",
    },
    {
      obsIdx: 4,
      event: "status_change",
      oldValue: "DRAFT",
      newValue: "ISSUED",
      comment:
        "Reviewed by HIA. Classified as MEDIUM as primary borrower KYC is complete and no material credit risk identified, but process improvement required for co-applicant and guarantor verification workflow.",
      userId: priyaId,
      date: "2025-12-26T14:00:00Z",
    },
    // Obs 5 — Annual review (MEDIUM → CLOSED)
    {
      obsIdx: 5,
      event: "created",
      comment:
        "Annual review delays documented for 4 self-employed borrower accounts with combined outstanding of Rs.83 lakh. Property revaluation overdue for 2 accounts beyond 3-year cycle. Branch attributes delays to staff transfer and limited valuer availability.",
      userId: sureshId,
      date: "2025-12-15T10:00:00Z",
    },
    {
      obsIdx: 5,
      event: "status_change",
      oldValue: "DRAFT",
      newValue: "ISSUED",
      comment: "Issued as MEDIUM severity. Compliance deadline set at 60 days.",
      userId: priyaId,
      date: "2025-12-26T15:00:00Z",
    },
    {
      obsIdx: 5,
      event: "status_change",
      oldValue: "ISSUED",
      newValue: "CLOSED",
      comment:
        "Branch completed all 4 pending annual reviews with updated ITRs and financial statements. Property revaluations commissioned and received for both overdue accounts — valuations confirm adequate security coverage with LTV ratios within policy limits. Review tracking register digitized and automated alerts configured in CBS. Verified by Zonal Auditor during follow-up visit on 25-Feb-2026.",
      userId: priyaId,
      date: "2026-02-28T10:00:00Z",
    },
  ];

  for (const te of timelineEvents) {
    await prisma.observationTimeline.create({
      data: {
        id: uid(`tl:${te.obsIdx}-${te.event}-${te.date}`),
        tenantId,
        observationId: ID.obs[te.obsIdx],
        event: te.event,
        oldValue: te.oldValue ?? null,
        newValue: te.newValue ?? null,
        comment: te.comment,
        createdById: te.userId,
        createdAt: d(te.date),
      },
    });
  }
  console.log(`  ✓ ${timelineEvents.length} timeline entries`);

  // RBI circular linkages
  for (const obs of observations) {
    for (const circ of obs.circulars) {
      const circularId = circularByNum.get(circ);
      if (circularId) {
        await prisma.observationRbiCircular.create({
          data: {
            id: uid(`orc:${obs.id}-${circ}`),
            observationId: obs.id,
            rbiCircularId: circularId,
          },
        });
      }
    }
  }
  console.log("  ✓ RBI circular linkages");

  // Auditee responses for observations with branch engagement
  await prisma.auditeeResponse.createMany({
    data: [
      {
        id: ID.ar[0],
        tenantId,
        observationId: ID.obs[0], // Sanctioning authority
        responseType: "COMPLIANCE_ACTION" as any,
        content:
          "The branch acknowledges the observation regarding sanctioning authority violations in 4 housing loan accounts. Upon review, the Branch Manager confirms that the delegation of powers circular was misinterpreted — the understanding was that the Rs.25 lakh limit applied to the unsecured portion only. This has been corrected. Immediate corrective actions taken: (1) All 4 identified accounts have been placed before the Branch Loan Committee for ex-post-facto ratification — committee meeting held on 08-Jan-2026; (2) A dual-authorization workflow has been implemented for all sanctions above Rs.15 lakh effective 10-Jan-2026, pending CBS-level enforcement; (3) All branch staff involved in loan processing have been issued the clarificatory circular on delegation limits. We request 90 days for CBS-level system enforcement implementation as this requires vendor involvement.",
        submittedById: vikramId,
        createdAt: d("2026-01-10T10:30:00Z"),
      },
      {
        id: ID.ar[1],
        tenantId,
        observationId: ID.obs[1], // NPA provisioning
        responseType: "COMPLIANCE_ACTION" as any,
        content:
          "The branch acknowledges the NPA provisioning observation and confirms the following corrective actions completed: (1) Account HL-KTH-2025-0049 has been immediately reclassified as NPA-Sub Standard in the CBS with DPD of 120 days as on audit date — the manual override has been reversed effective 22-Dec-2025; (2) Provisioning for both NPA-Sub Standard accounts has been increased from 10% to 15% as required; (3) Account HL-KTH-2025-0050 provisioning increased from 25% to 40% for Doubtful-II category; (4) Total additional provision of Rs.3.2 lakh passed in the books on 28-Dec-2025 with Voucher No. KTH/PROV/2025-26/Q3/047. We have also raised a formal request to the CBS vendor to disable the manual NPA override facility for non-AGM users. The staff member who applied the unauthorized override has been counselled and a disciplinary note has been placed on record.",
        submittedById: vikramId,
        createdAt: d("2026-01-08T14:00:00Z"),
      },
    ],
  });
  console.log("  ✓ 2 auditee responses");

  console.log("  Phase 5 complete.\n");

  /* ═════════════════════════════════════════════════════════════════════── */
  /*  PHASE 6: Compliance Lifecycle                                        */
  /* ═════════════════════════════════════════════════════════════════════── */
  console.log("Phase 6: Compliance Lifecycle...");

  const complianceItems: Array<{
    id: string;
    obsIdx: number;
    status: string;
    dueDate: string;
    daysOpen: number;
    escalationLevel: number;
    branchResponseText: string | null;
    branchResponseDate: string | null;
    zacReviewedById: string | null;
    zacReviewedAt: string | null;
    zacReviewComments: string | null;
    zacReviewDecision: string | null;
    aceReviewedById: string | null;
    aceReviewedAt: string | null;
    aceQuarter: string | null;
    acbReportedAt: string | null;
    acbMeetingRef: string | null;
    closedAt: string | null;
    closedById: string | null;
  }> = [
    {
      // Obs 0 — sanctioning authority → ACB_REVIEW (critical, fully escalated)
      id: ID.ci[0],
      obsIdx: 0,
      status: "ACB_REVIEW",
      dueDate: "2026-03-31",
      daysOpen: 72,
      escalationLevel: 3,
      branchResponseText:
        "Branch has implemented dual-authorization workflow for sanctions above Rs.15 lakh. All 4 identified accounts ratified by Branch Loan Committee on 08-Jan-2026 (Minutes ref: BLC/KTH/2025-26/Q3/14). CBS-level enforcement requested from vendor — expected implementation by 28-Feb-2026. Clarificatory circular issued to all branch staff on 05-Jan-2026 (ref: KTH/CIR/2025-26/042).",
      branchResponseDate: "2026-01-10T10:30:00Z",
      zacReviewedById: amitId,
      zacReviewedAt: "2026-01-20T11:00:00Z",
      zacReviewComments:
        "Branch response reviewed. Ex-post-facto ratification by BLC noted — however, the core issue of CBS-level control remains open. Manual dual-authorization is an interim measure but insufficient as a permanent control. Recommended for ACE escalation given aggregate exposure of Rs.1.76 crore and systemic nature of the finding. CBS vendor timeline of Feb-2026 to be monitored.",
      zacReviewDecision: "APPROVED",
      aceReviewedById: priyaId,
      aceReviewedAt: "2026-01-25T14:00:00Z",
      aceQuarter: "Q4_JAN_MAR",
      acbReportedAt: "2026-02-05T10:00:00Z",
      acbMeetingRef: "ACB/2025-26/Q4/Meeting-01",
      closedAt: null,
      closedById: null,
    },
    {
      // Obs 1 — NPA provisioning → ACE_REVIEW (critical, partially escalated)
      id: ID.ci[1],
      obsIdx: 1,
      status: "ACE_REVIEW",
      dueDate: "2026-02-28",
      daysOpen: 65,
      escalationLevel: 2,
      branchResponseText:
        "All corrective actions completed: (1) Account HL-KTH-2025-0049 reclassified as NPA-Sub Standard effective 22-Dec-2025; (2) Provisioning rates corrected — Sub-Standard at 15%, Doubtful-II at 40%; (3) Additional provision of Rs.3.2 lakh passed vide Voucher No. KTH/PROV/2025-26/Q3/047 on 28-Dec-2025; (4) CBS override restriction request raised with vendor (Ticket #CBS-2026-0142). Staff member counselled and disciplinary note placed on record.",
      branchResponseDate: "2026-01-08T14:00:00Z",
      zacReviewedById: amitId,
      zacReviewedAt: "2026-01-18T10:00:00Z",
      zacReviewComments:
        "Branch has taken prompt corrective action on provisioning shortfall — verified through CBS reports that provisions have been correctly applied. However, the CBS override control issue remains systemic and needs bank-wide remediation. CBS vendor ticket status to be tracked. Recommended for ACE review to ensure bank-wide NPA override controls are addressed in the upcoming CBS enhancement cycle.",
      zacReviewDecision: "APPROVED",
      aceReviewedById: priyaId,
      aceReviewedAt: "2026-01-28T11:00:00Z",
      aceQuarter: "Q4_JAN_MAR",
      acbReportedAt: null,
      acbMeetingRef: null,
      closedAt: null,
      closedById: null,
    },
    {
      // Obs 2 — CRILC reporting → ZAC_APPROVED
      id: ID.ci[2],
      obsIdx: 2,
      status: "ZAC_APPROVED",
      dueDate: "2026-03-15",
      daysOpen: 55,
      escalationLevel: 1,
      branchResponseText:
        "Corrective actions implemented: (1) CRILC data extraction now automated through CBS scheduled report (configured on 15-Jan-2026) — data transmitted to Head Office on T+0 basis; (2) Weekly SMA review meeting schedule formalized — meetings held on every Monday at 10:00 AM with mandatory attendance log; minutes for weeks 1-4 of January 2026 submitted as evidence; (3) SMA escalation matrix displayed at Advances section and shared with all credit staff via email on 12-Jan-2026; (4) Automated SMS alerts configured for SMA-1 and SMA-2 classification events.",
      branchResponseDate: "2026-01-15T09:00:00Z",
      zacReviewedById: amitId,
      zacReviewedAt: "2026-01-22T14:00:00Z",
      zacReviewComments:
        "Branch has demonstrated substantive corrective action. CRILC automation verified — no reporting delays since implementation. SMA weekly meeting minutes reviewed for 4 consecutive weeks — adequate documentation. SMS alert configuration confirmed through test notification. Recommending continued monitoring for 1 quarter before closure to ensure sustained compliance.",
      zacReviewDecision: "APPROVED",
      aceReviewedById: null,
      aceReviewedAt: null,
      aceQuarter: null,
      acbReportedAt: null,
      acbMeetingRef: null,
      closedAt: null,
      closedById: null,
    },
    {
      // Obs 3 — Fair practices → ZAC_REJECTED (rejection workflow!)
      id: ID.ci[3],
      obsIdx: 3,
      status: "BRANCH_RESPONSE_DUE",
      dueDate: "2026-02-15",
      daysOpen: 62,
      escalationLevel: 1,
      branchResponseText:
        "Branch has taken the following actions: (1) Grievance redressal display board reinstated at branch entrance on 02-Jan-2026; (2) Vernacular MITC in Marathi language to be issued to all new borrowers going forward; (3) Customer complaint register purchased and placed at the cash counter area.",
      branchResponseDate: "2026-01-12T11:00:00Z",
      zacReviewedById: amitId,
      zacReviewedAt: "2026-01-20T15:00:00Z",
      zacReviewComments:
        "Branch response is INADEQUATE and REJECTED for the following reasons: (1) The response states vernacular MITC 'to be issued going forward' but does not address the retrospective issuance to the 6 identified borrowers as recommended — this remains a compliance gap; (2) The complaint register is described as 'purchased and placed' but no evidence of entries or format compliance with the prescribed template has been provided — a blank register does not demonstrate implementation; (3) Most critically, the two unresolved customer complaints (15-Oct and 22-Oct-2025) are not mentioned at all in the response — the branch has not provided resolution status, root cause, or preventive measures for the 30-day TAT breach. The branch must submit a revised response within 15 days addressing all three deficiencies with supporting evidence.",
      zacReviewDecision: "REJECTED",
      aceReviewedById: null,
      aceReviewedAt: null,
      aceQuarter: null,
      acbReportedAt: null,
      acbMeetingRef: null,
      closedAt: null,
      closedById: null,
    },
    {
      // Obs 4 — KYC gaps → BRANCH_RESPONSE_SUBMITTED
      id: ID.ci[4],
      obsIdx: 4,
      status: "BRANCH_RESPONSE_SUBMITTED",
      dueDate: "2026-03-31",
      daysOpen: 45,
      escalationLevel: 0,
      branchResponseText:
        "Corrective actions initiated: (1) Pre-sanction compliance checklist updated to include separate verification of CIBIL validity dates for co-applicants and guarantors — revised checklist effective 15-Jan-2026 (copy attached); (2) Missing guarantor CIBIL for account HL-KTH-2025-0031 obtained on 08-Jan-2026 and placed on file; (3) Income proof for guarantor in account HL-KTH-2025-0038 obtained (ITR for AY2025-26); (4) Address verification document pending for one guarantor — follow-up letter sent on 10-Jan-2026 with 15-day deadline. The branch has also started maintaining a documentation deficiency tracker (Excel-based) with weekly review by the Branch Manager.",
      branchResponseDate: "2026-01-16T10:00:00Z",
      zacReviewedById: null,
      zacReviewedAt: null,
      zacReviewComments: null,
      zacReviewDecision: null,
      aceReviewedById: null,
      aceReviewedAt: null,
      aceQuarter: null,
      acbReportedAt: null,
      acbMeetingRef: null,
      closedAt: null,
      closedById: null,
    },
    {
      // Obs 5 — Annual review → CLOSED
      id: ID.ci[5],
      obsIdx: 5,
      status: "CLOSED",
      dueDate: "2026-02-28",
      daysOpen: 0,
      escalationLevel: 0,
      branchResponseText:
        "All 4 pending annual reviews completed: (1) HL-KTH-2025-0005 — review completed 20-Jan-2026 with updated ITR AY2025-26, business income stable; (2) HL-KTH-2025-0014 — review completed 22-Jan-2026, proprietorship continues operations, turnover growth of 8%; (3) HL-KTH-2025-0033 — review completed 25-Jan-2026, partnership firm financials obtained, adequate debt service capacity confirmed; (4) HL-KTH-2025-0041 — review completed 28-Jan-2026, professional income verified through Form 16A. Property revaluations completed: HL-KTH-2025-0005 revalued at Rs.62 lakh (previous Rs.48 lakh, LTV adequate), HL-KTH-2025-0014 revalued at Rs.55 lakh (previous Rs.42 lakh, LTV 40%). Automated CBS alerts for review due dates configured on 01-Feb-2026.",
      branchResponseDate: "2026-02-01T10:00:00Z",
      zacReviewedById: amitId,
      zacReviewedAt: "2026-02-10T14:00:00Z",
      zacReviewComments:
        "All corrective actions verified. Annual reviews completed with adequate documentation. Property revaluations confirm satisfactory security coverage. CBS automated alerts verified through system screenshot. Branch has demonstrated full compliance. Recommending closure.",
      zacReviewDecision: "APPROVED",
      aceReviewedById: null,
      aceReviewedAt: null,
      aceQuarter: null,
      acbReportedAt: null,
      acbMeetingRef: null,
      closedAt: "2026-02-28T10:00:00Z",
      closedById: priyaId,
    },
  ];

  for (const ci of complianceItems) {
    await prisma.complianceItem.create({
      data: {
        id: ci.id,
        tenantId,
        observationId: ID.obs[ci.obsIdx],
        auditId: ID.eng1,
        branchId: kothrudId,
        status: ci.status as any,
        dueDate: d(ci.dueDate),
        daysOpen: ci.daysOpen,
        escalationLevel: ci.escalationLevel,
        branchResponseText: ci.branchResponseText,
        branchResponseDate: ci.branchResponseDate
          ? d(ci.branchResponseDate)
          : null,
        branchResponseEvidence: [],
        zacReviewedById: ci.zacReviewedById,
        zacReviewedAt: ci.zacReviewedAt ? d(ci.zacReviewedAt) : null,
        zacReviewComments: ci.zacReviewComments,
        zacReviewDecision: ci.zacReviewDecision,
        aceReviewedById: ci.aceReviewedById,
        aceReviewedAt: ci.aceReviewedAt ? d(ci.aceReviewedAt) : null,
        aceQuarter: ci.aceQuarter,
        acbReportedAt: ci.acbReportedAt ? d(ci.acbReportedAt) : null,
        acbMeetingRef: ci.acbMeetingRef,
        closedAt: ci.closedAt ? d(ci.closedAt) : null,
        closedById: ci.closedById,
      },
    });
  }

  const statusCounts = complianceItems.reduce(
    (acc, ci) => {
      acc[ci.status] = (acc[ci.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  console.log(
    `  ✓ 6 compliance items (${Object.entries(statusCounts)
      .map(([s, c]) => `${c} ${s}`)
      .join(", ")})`,
  );

  // Update observation statuses to reflect compliance stage
  await prisma.observation.update({
    where: { id: ID.obs[5] },
    data: { status: "CLOSED", statusUpdatedAt: d("2026-02-28T10:00:00Z") },
  });

  console.log("  Phase 6 complete.\n");

  /* ═════════════════════════════════════════════════════════════════════── */
  /*  PHASE 7: Board Report & Governance                                   */
  /* ═════════════════════════════════════════════════════════════════════── */
  console.log("Phase 7: Board Report...");

  await prisma.boardReport.create({
    data: {
      id: ID.board,
      tenantId,
      year: 2025,
      quarter: "Q4_JAN_MAR" as any,
      title:
        "Internal Audit Report to the Board — Q4 FY2025-26 (January–March 2026)",
      executiveCommentary:
        "During Q3 FY2025-26, the Internal Audit Department completed RBIA examination of the housing loan portfolio at Kothrud Branch (BR002). The branch achieved a composite RBIA score of 0.78 (GOOD band), reflecting generally sound credit practices with material exceptions in sanctioning authority compliance and NPA provisioning. Two critical observations — sanctioning authority violations affecting Rs.1.76 crore exposure and NPA provisioning shortfall of Rs.3.2 lakh with unauthorized CBS override — have been escalated through the compliance hierarchy and require Board attention.\n\nThe bank's overall audit coverage stands at 85% against the annual plan target. Risk assessment through the RAM framework has been completed for all branches, with Kothrud Branch rated HIGH risk (composite 3.8) warranting annual audit frequency. The RBIA scoring methodology was applied for the first time to housing loans, providing granular visibility into 23 compliance parameters across 6 functional areas.\n\nKey recommendations for Board consideration: (1) Approve CBS enhancement for delegation of powers enforcement — estimated cost Rs.2.5 lakh, implementation timeline 60 days; (2) Direct bank-wide review of NPA override transactions to identify any similar instances at other branches; (3) Mandate quarterly reporting of sanctions exceeding Rs.15 lakh by all branches to the Loan Committee; (4) Review adequacy of the Fair Practices Code implementation framework given multiple violations identified at Kothrud Branch.\n\nThe Internal Audit Department will continue to monitor compliance action implementation with next follow-up scheduled for March 2026.",
      generatedById: priyaId,
      generatedAt: d("2026-02-10T10:00:00Z"),
      hiaRecommendations:
        "1. CBS delegation of powers enforcement module — Board to approve development budget and timeline\n2. Bank-wide NPA override audit — one-time exercise across all branches within 45 days\n3. Quarterly sanction reporting to Loan Committee — amendment to Lending Policy recommended\n4. Fair Practices Code compliance review — Customer Service Committee to conduct branch-wise assessment\n5. Automated CRILC reporting — CBS vendor engagement for direct RBI portal integration\n6. Annual review tracking automation — CBS enhancement to prevent review lapses",
      branchRatingDistribution: {
        VERY_GOOD: 1,
        GOOD: 3,
        SATISFACTORY: 2,
        MODERATE: 1,
        POOR: 0,
      },
      systemicFindings: [
        {
          finding:
            "Sanctioning authority compliance — CBS does not enforce delegation limits",
          affectedBranches: ["Kothrud", "Pimpri"],
          severity: "CRITICAL",
        },
        {
          finding:
            "NPA manual override controls inadequate — no multi-level authorization required",
          affectedBranches: ["Kothrud"],
          severity: "CRITICAL",
        },
        {
          finding:
            "Fair Practices Code implementation gaps — vernacular documentation and complaint management",
          affectedBranches: ["Kothrud", "Shivajinagar"],
          severity: "HIGH",
        },
      ],
      complianceAging: {
        "0-30": 2,
        "31-60": 2,
        "61-90": 2,
        "91-120": 0,
        ">120": 0,
      },
      trendData: [
        { quarter: "Q1_APR_JUN", avgScore: 0.82, branchCount: 2 },
        { quarter: "Q2_JUL_SEP", avgScore: 0.79, branchCount: 3 },
        { quarter: "Q3_OCT_DEC", avgScore: 0.78, branchCount: 2 },
      ],
      metricsSnapshot: {
        totalObservations: 18,
        criticalOpen: 2,
        highOpen: 2,
        mediumOpen: 1,
        lowOpen: 0,
        closedThisQuarter: 5,
        complianceRate: 72,
        auditCoverage: 85,
        averageDaysToClose: 48,
        repeatFindingRate: 11,
      },
    },
  });

  console.log("  ✓ Board report Q4 FY2025-26 created");
  console.log("  Phase 7 complete.\n");

  /* ═════════════════════════════════════════════════════════════════════── */
  /*  PHASE 8: Supporting Data                                             */
  /* ═════════════════════════════════════════════════════════════════════── */
  console.log("Phase 8: Supporting Data...");

  // 8a. Dashboard Snapshots (quarterly trends)
  await prisma.dashboardSnapshot.createMany({
    data: [
      {
        id: ID.snap[0],
        tenantId,
        capturedAt: d("2025-06-30T23:59:00Z"),
        metrics: {
          healthScore: 78,
          compliance: { total: 12, compliant: 9, percentage: 75 },
          severity: {
            total: 12,
            criticalOpen: 0,
            highOpen: 2,
            mediumOpen: 3,
            lowOpen: 1,
          },
        },
      },
      {
        id: ID.snap[1],
        tenantId,
        capturedAt: d("2025-09-30T23:59:00Z"),
        metrics: {
          healthScore: 74,
          compliance: { total: 15, compliant: 10, percentage: 67 },
          severity: {
            total: 15,
            criticalOpen: 1,
            highOpen: 3,
            mediumOpen: 2,
            lowOpen: 2,
          },
        },
      },
      {
        id: ID.snap[2],
        tenantId,
        capturedAt: d("2025-12-31T23:59:00Z"),
        metrics: {
          healthScore: 71,
          compliance: { total: 21, compliant: 13, percentage: 62 },
          severity: {
            total: 21,
            criticalOpen: 2,
            highOpen: 4,
            mediumOpen: 3,
            lowOpen: 2,
          },
        },
      },
      {
        id: ID.snap[3],
        tenantId,
        capturedAt: d("2026-02-28T23:59:00Z"),
        metrics: {
          healthScore: 73,
          compliance: { total: 18, compliant: 13, percentage: 72 },
          severity: {
            total: 18,
            criticalOpen: 2,
            highOpen: 2,
            mediumOpen: 1,
            lowOpen: 0,
          },
        },
      },
    ],
  });
  console.log("  ✓ 4 dashboard snapshots (quarterly trend)");

  // 8b. User-Branch Assignments
  await prisma.userBranchAssignment.createMany({
    data: [
      {
        id: ID.uba[0],
        tenantId,
        userId: vikramId,
        branchId: kothrudId,
      },
      {
        id: ID.uba[1],
        tenantId,
        userId: vikramId,
        branchId: shivajiId,
      },
      {
        id: ID.uba[2],
        tenantId,
        userId: sureshId,
        branchId: kothrudId,
      },
    ],
  });
  console.log("  ✓ 3 user-branch assignments");

  // 8c. Audit Log entries (key lifecycle events)
  const auditLogEntries: Array<{
    tableName: string;
    recordId: string;
    operation: string;
    actionType: string;
    userId: string;
    date: string;
    newData: any;
  }> = [
    {
      tableName: "RamAssessment",
      recordId: ID.ram,
      operation: "CREATE",
      actionType: "ram.assessment_computed",
      userId: priyaId,
      date: "2025-09-15T10:00:00Z",
      newData: {
        compositeScore: 3.8,
        riskCategory: "HIGH",
        branchCode: "BR002",
      },
    },
    {
      tableName: "RamAssessment",
      recordId: ID.ram,
      operation: "UPDATE",
      actionType: "ram.assessment_approved",
      userId: rajeshId,
      date: "2025-09-18T14:00:00Z",
      newData: { status: "APPROVED", approvedBy: "CEO" },
    },
    {
      tableName: "AuditEngagement",
      recordId: ID.eng1,
      operation: "CREATE",
      actionType: "engagement.created",
      userId: priyaId,
      date: "2025-10-01T09:00:00Z",
      newData: {
        auditNumber: "RBIA/2025-26/BR-002/V1",
        status: "PLANNED",
        branchCode: "BR002",
      },
    },
    {
      tableName: "AuditEngagement",
      recordId: ID.eng1,
      operation: "UPDATE",
      actionType: "engagement.started",
      userId: sureshId,
      date: "2025-10-15T10:00:00Z",
      newData: { status: "IN_PROGRESS", actualStartDate: "2025-10-15" },
    },
    {
      tableName: "BranchRbiaScore",
      recordId: ID.score,
      operation: "CREATE",
      actionType: "rbia.score_frozen",
      userId: priyaId,
      date: "2025-12-22T10:00:00Z",
      newData: {
        compositeScore: 0.78,
        ratingBand: "GOOD",
        branchCode: "BR002",
      },
    },
    {
      tableName: "AuditEngagement",
      recordId: ID.eng1,
      operation: "UPDATE",
      actionType: "engagement.completed",
      userId: priyaId,
      date: "2025-12-22T12:00:00Z",
      newData: {
        status: "COMPLETED",
        overallRiskRating: "GOOD",
        completionDate: "2025-12-22",
      },
    },
    {
      tableName: "Observation",
      recordId: ID.obs[0],
      operation: "CREATE",
      actionType: "observation.created",
      userId: sureshId,
      date: "2025-12-20T10:00:00Z",
      newData: {
        title: "Sanctioning authority exceeded",
        severity: "CRITICAL",
        branchCode: "BR002",
      },
    },
    {
      tableName: "Observation",
      recordId: ID.obs[0],
      operation: "UPDATE",
      actionType: "observation.issued",
      userId: priyaId,
      date: "2025-12-28T14:30:00Z",
      newData: { status: "ISSUED", issuedBy: "HIA" },
    },
    {
      tableName: "BoardReport",
      recordId: ID.board,
      operation: "CREATE",
      actionType: "report.board_generated",
      userId: priyaId,
      date: "2026-02-10T10:00:00Z",
      newData: {
        title: "Internal Audit Report Q4 FY2025-26",
        quarter: "Q4_JAN_MAR",
      },
    },
    {
      tableName: "ComplianceItem",
      recordId: ID.ci[5],
      operation: "UPDATE",
      actionType: "compliance.closed",
      userId: priyaId,
      date: "2026-02-28T10:00:00Z",
      newData: {
        status: "CLOSED",
        observation: "Annual review overdue",
        branchCode: "BR002",
      },
    },
  ];

  await prisma.auditLog.createMany({
    data: auditLogEntries.map((entry, i) => ({
      id: ID.log[i],
      tenantId,
      tableName: entry.tableName,
      recordId: entry.recordId,
      operation: entry.operation,
      actionType: entry.actionType,
      userId: entry.userId,
      oldData: null,
      newData: entry.newData,
      ipAddress: "10.0.1.50",
      createdAt: d(entry.date),
      retentionExpiresAt: new Date(
        d(entry.date).getTime() + 10 * 365.25 * 24 * 60 * 60 * 1000,
      ),
    })),
  });
  console.log("  ✓ 10 audit log entries");

  // 8d. Second engagement (Shivajinagar — IN_PROGRESS, simpler)
  await prisma.auditEngagement.create({
    data: {
      id: ID.eng2,
      auditPlanId: q3Plan.id,
      tenantId,
      branchId: shivajiId,
      auditAreaId: opsArea.id,
      assignedToId: priyaId,
      status: "IN_PROGRESS",
      auditNumber: "RBIA/2025-26/BR-003/V1",
      auditType: "RBIA",
      visitNumber: 1,
      periodFrom: d("2025-04-01"),
      periodTo: d("2025-09-30"),
      scheduledStartDate: d("2026-01-06"),
      actualStartDate: d("2026-01-06"),
      bhCertSignedById: vikramId,
      bhCertSignedAt: d("2026-01-06T09:00:00Z"),
      bhCertComments:
        "Branch records and operational documents made available for audit. Access to CBS and operational registers provided.",
      bhCertCountersignedById: amitId,
      bhCertCountersignedAt: d("2026-01-06T09:30:00Z"),
    },
  });

  await prisma.auditTeamMember.create({
    data: {
      id: ID.team2Lead,
      tenantId,
      engagementId: ID.eng2,
      userId: amitId,
      roleInEngagement: "LEAD_AUDITOR",
      assignedSections: ["OPS"],
    },
  });

  await prisma.engagementMeeting.create({
    data: {
      id: ID.meet2Open,
      tenantId,
      engagementId: ID.eng2,
      meetingType: "OPENING",
      meetingDate: d("2026-01-06T10:00:00Z"),
      attendees: [
        {
          name: "Amit Joshi",
          role: "Lead Auditor",
          designation: "CCO",
        },
        {
          name: "Shivajinagar Branch Manager",
          role: "Auditee",
          designation: "Branch Manager",
        },
      ],
      minutesText:
        "Opening meeting for RBIA audit of Shivajinagar Branch operational risk assessment. Audit covers FY2025-26 H1 operations including cash management, deposit operations, customer service standards, and housekeeping compliance. Timeline: Jan 6 – Feb 28, 2026.",
      keyDiscussionPoints:
        "1. Audit scope limited to operational risk areas\n2. Branch to provide cash verification records and deposit registers\n3. Previous audit had 1 repeat finding on cash management — will be reviewed",
      signedOff: true,
      signedOffById: amitId,
      signedOffAt: d("2026-01-06T11:00:00Z"),
    },
  });

  console.log(
    "  ✓ Second engagement RBIA/2025-26/BR-003/V1 (IN_PROGRESS with opening meeting)",
  );
  console.log("  Phase 8 complete.\n");
  console.log("\n✅ Lifecycle seed complete!");
  console.log("   Run 'pnpm dev' and verify pages show populated data.\n");
}

/* ─── Execute with cleanup ───────────────────────────────────────────────── */

/**
 * Seed runs without an app session, so every write to an audited table would
 * fail the audit trigger's NOT NULL tenant context. Suspend the triggers around
 * the whole seed.
 *
 * This replaces `SET session_replication_role = 'replica'`, which was wrong
 * twice over: it needs superuser, and it is per-connection, so with a pooled
 * adapter (`max: 25`) the next statement could land on a connection that never
 * saw it. `withTriggersDetached` uses ALTER TABLE, which the table owner may
 * run, is visible to every connection, and restores in a `finally`.
 */
async function main() {
  return withTriggersDetached(prisma, seedLifecycle);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
