/**
 * AEGIS Database Seed Script
 *
 * Seeds the database with demo data for 2 tenants:
 *   1. Apex Sahakari Bank (primary demo tenant with full data)
 *   2. Test Bank B (minimal tenant for isolation testing)
 *
 * Run: pnpm prisma db seed
 */

import {
  PrismaClient,
  Role,
  Severity,
  ObservationStatus,
  ComplianceStatus,
  UcbTier,
  PcaStatus,
  Quarter,
  AuditPlanStatus,
  EngagementStatus,
  UserStatus,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { withTriggersDetached } from "../src/lib/audit-triggers";
import { assertSafeSeedTarget } from "../src/lib/seed-guard";
import { hashedCredentialAccount } from "../src/lib/credential-account";

assertSafeSeedTarget({
  nodeEnv: process.env.NODE_ENV,
  databaseUrl: process.env.DATABASE_URL,
  allowDestructiveSeed: process.env.ALLOW_DESTRUCTIVE_SEED,
});

const databaseUrl = process.env.DATABASE_URL as string;
const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// ─── Severity / status mappers ───────────────────────────────────────────────

function mapSeverity(s: string): Severity {
  const map: Record<string, Severity> = {
    critical: "CRITICAL",
    high: "HIGH",
    medium: "MEDIUM",
    low: "LOW",
  };
  return map[s.toLowerCase()] ?? "MEDIUM";
}

function mapObservationStatus(s: string): ObservationStatus {
  const map: Record<string, ObservationStatus> = {
    draft: "DRAFT",
    submitted: "SUBMITTED",
    reviewed: "REVIEWED",
    issued: "ISSUED",
    responded: "RESPONSE",
    closed: "CLOSED",
  };
  return map[s.toLowerCase()] ?? "DRAFT";
}

function mapComplianceStatus(s: string): ComplianceStatus {
  const map: Record<string, ComplianceStatus> = {
    compliant: "COMPLIANT",
    partial: "PARTIAL",
    "non-compliant": "NON_COMPLIANT",
    pending: "PENDING",
  };
  return map[s.toLowerCase()] ?? "PENDING";
}

function mapAuditStatus(s: string): AuditPlanStatus {
  const map: Record<string, AuditPlanStatus> = {
    completed: "COMPLETED",
    "in-progress": "IN_PROGRESS",
    planned: "PLANNED",
    "on-hold": "ON_HOLD",
    cancelled: "CANCELLED",
  };
  return map[s.toLowerCase()] ?? "PLANNED";
}

// Map audit type to an Indian fiscal quarter based on date
function dateToQuarter(dateStr: string): Quarter {
  const month = new Date(dateStr).getMonth() + 1; // 1-12
  if (month >= 4 && month <= 6) return "Q1_APR_JUN";
  if (month >= 7 && month <= 9) return "Q2_JUL_SEP";
  if (month >= 10 && month <= 12) return "Q3_OCT_DEC";
  return "Q4_JAN_MAR"; // Jan-Mar
}

function fiscalYear(dateStr: string): number {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  // Indian fiscal year: Apr 2025 - Mar 2026 → FY 2025
  return month >= 4 ? year : year - 1;
}

async function main() {
  console.log("🌱 Seeding AEGIS database...\n");

  // ─── 1. Clean existing data ──────────────────────────────────────────

  console.log("  Cleaning existing data...");
  // Delete in dependency order (children before parents)
  await prisma.failedLoginAttempt.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.emailLog.deleteMany();
  await prisma.dashboardSnapshot.deleteMany();
  await prisma.onboardingProgress.deleteMany();
  await prisma.notificationQueue.deleteMany();
  await prisma.notificationPreference.deleteMany();
  await prisma.boardReport.deleteMany();
  await prisma.observationTimeline.deleteMany();
  await prisma.observationRbiCircular.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.auditeeResponse.deleteMany();
  await prisma.observation.deleteMany();
  await prisma.complianceRequirement.deleteMany();
  await prisma.userBranchAssignment.deleteMany();
  await prisma.auditEngagement.deleteMany();
  await prisma.auditPlan.deleteMany();
  await prisma.auditArea.deleteMany();
  await prisma.committeeMeeting.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.zone.deleteMany();
  await prisma.rbiCircular.deleteMany();
  await prisma.account.deleteMany();
  await prisma.session.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();

  // ─── 2. Create Tenants ───────────────────────────────────────────────

  console.log("  Creating tenants...");

  const tenantA = await prisma.tenant.create({
    data: {
      name: "Apex Sahakari Bank Ltd",
      shortName: "Apex Bank",
      rbiLicenseNo: "UCB-MAH-1985-1234",
      tier: UcbTier.TIER_2,
      state: "Maharashtra",
      city: "Pune",
      scheduledBankStatus: true,
      nabardRegistrationNo: null,
      multiStateLicense: false,
      // DAKSH/PCA fields — nullable for demo (D21)
      dakshScore: null,
      dakshScoreDate: null,
      pcaStatus: PcaStatus.NONE,
      pcaEffectiveDate: null,
      lastRbiInspectionDate: null,
      rbiRiskRating: null,
      // The seed fully provisions this tenant, so it is already onboarded — the
      // dashboard redirect that steers un-onboarded admins into the wizard must
      // not fire for it.
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
      settings: {
        defaultLanguage: "en",
        fiscalYearStart: "April",
        timezone: "Asia/Kolkata",
      },
    },
  });

  const tenantB = await prisma.tenant.create({
    data: {
      name: "Test Nagari Sahakari Bank Ltd",
      shortName: "Test Bank B",
      rbiLicenseNo: "UCB-KAR-2000-5678",
      tier: UcbTier.TIER_3,
      state: "Karnataka",
      city: "Bengaluru",
      scheduledBankStatus: false,
      pcaStatus: PcaStatus.NONE,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date(),
      settings: {
        defaultLanguage: "en",
        fiscalYearStart: "April",
        timezone: "Asia/Kolkata",
      },
    },
  });

  console.log(`    ✓ Tenant A: ${tenantA.name} (${tenantA.id})`);
  console.log(`    ✓ Tenant B: ${tenantB.name} (${tenantB.id})`);

  // ─── 3. Create Users with role ARRAYS (D13) ─────────────────────────

  console.log("  Creating users...");

  const userCEO = await prisma.user.create({
    data: {
      email: "rajesh.deshmukh@apexbank.example",
      name: "Rajesh Deshmukh",
      roles: [Role.CEO],
      tenantId: tenantA.id,
      status: UserStatus.ACTIVE,
    },
  });

  // Multi-role user: CAE + AUDIT_MANAGER (D13 — small bank dual-hatting)
  const userCAE = await prisma.user.create({
    data: {
      email: "priya.sharma@apexbank.example",
      name: "Priya Sharma",
      roles: [Role.CAE, Role.AUDIT_MANAGER],
      tenantId: tenantA.id,
      status: UserStatus.ACTIVE,
    },
  });

  const userCCO = await prisma.user.create({
    data: {
      email: "amit.joshi@apexbank.example",
      name: "Amit Joshi",
      roles: [Role.CCO],
      tenantId: tenantA.id,
      status: UserStatus.ACTIVE,
    },
  });

  const userAuditor = await prisma.user.create({
    data: {
      email: "suresh.patil@apexbank.example",
      name: "Suresh Patil",
      roles: [Role.AUDITOR],
      tenantId: tenantA.id,
      status: UserStatus.ACTIVE,
    },
  });

  // Multi-role: AUDITEE + AUDITOR (branch manager who also participates in audits)
  const userAuditee = await prisma.user.create({
    data: {
      email: "vikram.kulkarni@apexbank.example",
      name: "Vikram Kulkarni",
      roles: [Role.AUDITEE, Role.AUDITOR],
      tenantId: tenantA.id,
      status: UserStatus.ACTIVE,
    },
  });

  // Test Bank B user
  const userBankB = await prisma.user.create({
    data: {
      email: "admin@testbank.example",
      name: "Test Bank Admin",
      roles: [Role.CEO, Role.CAE],
      tenantId: tenantB.id,
      status: UserStatus.ACTIVE,
    },
  });

  const allUsersA = [userCEO, userCAE, userCCO, userAuditor, userAuditee];
  console.log(`    ✓ Created ${allUsersA.length} users for Tenant A`);
  console.log(`    ✓ Created 1 user for Tenant B`);
  console.log(
    `    ✓ Multi-role users: ${userCAE.name} (CAE+AUDIT_MANAGER), ${userAuditee.name} (AUDITEE+AUDITOR), ${userBankB.name} (CEO+CAE)`,
  );

  // ─── 3b. Create Better Auth Accounts (passwords for login) ─────────

  console.log("  Creating auth accounts...");
  const TEST_PASSWORD = "TestPassword123!";
  const allUsers = [...allUsersA, userBankB];
  for (const user of allUsers) {
    await prisma.account.create({
      data: await hashedCredentialAccount(user.id, TEST_PASSWORD),
    });
  }
  console.log(
    `    ✓ Created ${allUsers.length} auth accounts (password: ${TEST_PASSWORD})`,
  );

  // ─── 3c. Create Zones ──────────────────────────────────────────────

  console.log("  Creating zones...");

  const zoneData = [
    { code: "WEST", name: "Western Zone" },
    { code: "EAST", name: "Eastern Zone" },
    { code: "CENTRAL", name: "Central Zone" },
    { code: "NORTH", name: "Northern Zone" },
  ];

  const zones = await Promise.all(
    zoneData.map((z) =>
      prisma.zone.create({
        data: { ...z, tenantId: tenantA.id },
      }),
    ),
  );

  const zoneMap = new Map<string, string>();
  zones.forEach((z) => zoneMap.set(z.code, z.id));

  console.log(`    ✓ Created ${zones.length} zones for Tenant A`);

  // ─── 4. Create Branches ─────────────────────────────────────────────

  console.log("  Creating branches...");

  const branchData = [
    {
      code: "BR001",
      name: "Head Office",
      city: "Pune",
      state: "Maharashtra",
      type: "Head Office",
    },
    {
      code: "BR002",
      name: "Kothrud Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR003",
      name: "Shivajinagar Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR004",
      name: "Camp Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR005",
      name: "Kasar Sai Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR006",
      name: "Chinchwad Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR007",
      name: "Pimpri Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR008",
      name: "Bibvewadi Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR009",
      name: "Kondhwa Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR010",
      name: "Hadapsar Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR011",
      name: "Viman Nagar Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
    {
      code: "BR012",
      name: "Wanowrie Branch",
      city: "Pune",
      state: "Maharashtra",
      type: "Branch",
    },
  ];

  const branches = await Promise.all(
    branchData.map((b) =>
      prisma.branch.create({
        data: { ...b, tenantId: tenantA.id },
      }),
    ),
  );

  // Test Bank B branch
  const branchB = await prisma.branch.create({
    data: {
      code: "TB001",
      name: "Test Bank HQ",
      city: "Bengaluru",
      state: "Karnataka",
      type: "Head Office",
      tenantId: tenantB.id,
    },
  });

  console.log(`    ✓ Created ${branches.length} branches for Tenant A`);

  // ─── 4b. Seed RAM Parameters ────────────────────────────────────────

  console.log("  Seeding RAM parameters...");

  const ramParametersData = await import(
    "../src/data/seed/ram-parameters.json",
    { with: { type: "json" } }
  ).then((m) => m.default);

  for (const tenantId of [tenantA.id, tenantB.id]) {
    for (const param of ramParametersData) {
      await prisma.ramParameterConfig.upsert({
        where: {
          tenantId_code: { tenantId, code: param.code },
        },
        update: {
          name: param.name,
          category: param.category,
          weight: param.weight,
          maxScore: param.maxScore,
          scoringCriteria: param.scoringCriteria as any,
          displayOrder: param.displayOrder,
        },
        create: {
          tenantId,
          code: param.code,
          name: param.name,
          category: param.category,
          weight: param.weight,
          maxScore: param.maxScore,
          scoringCriteria: param.scoringCriteria as any,
          displayOrder: param.displayOrder,
          isActive: true,
        },
      });
    }
  }

  console.log(
    `    ✓ ${ramParametersData.length} RAM parameters seeded for both tenants`,
  );

  // ─── 4c. Seed Examination Areas + Items ─────────────────────────────

  console.log("  Seeding examination areas and items...");

  const examinationAreasData = await import(
    "../src/data/seed/examination-areas.json",
    { with: { type: "json" } }
  ).then((m) => m.default);
  const examinationItemsData = await import(
    "../src/data/seed/examination-items.json",
    { with: { type: "json" } }
  ).then((m) => m.default);

  for (const tid of [tenantA.id, tenantB.id]) {
    const areaIdMap = new Map<string, string>();

    for (const area of examinationAreasData) {
      const record = await prisma.examinationArea.upsert({
        where: {
          tenantId_code: { tenantId: tid, code: area.code },
        },
        update: {
          name: area.name,
          displayOrder: area.displayOrder,
        },
        create: {
          tenantId: tid,
          code: area.code,
          name: area.name,
          riskWeight: 1.0,
          displayOrder: area.displayOrder,
          isActive: true,
        },
      });
      areaIdMap.set(area.code, record.id);
      // Also map by sectionNumber for items that use numeric areaCode
      if ((area as any).sectionNumber) {
        areaIdMap.set(String((area as any).sectionNumber), record.id);
      }
    }

    let itemCount = 0;
    for (const item of examinationItemsData) {
      // Items may reference areas by code ("CASH") or by numeric areaCode ("1")
      let areaId = areaIdMap.get(item.areaCode);
      if (!areaId) {
        // Try to find by name match
        for (const area of examinationAreasData) {
          if (area.name === (item as any).areaName) {
            areaId = areaIdMap.get(area.code);
            break;
          }
        }
      }
      if (!areaId) {
        continue; // Skip unmapped items silently
      }

      await prisma.examinationItem.upsert({
        where: {
          tenantId_areaId_itemNumber: {
            tenantId: tid,
            areaId,
            itemNumber: item.itemNumber,
          },
        },
        update: {
          particulars: item.particulars,
          riskCategory: item.riskCategory,
          regulatoryRef: (item as any).regulatoryReference ?? null,
          displayOrder: item.displayOrder,
        },
        create: {
          tenantId: tid,
          areaId,
          itemNumber: item.itemNumber,
          particulars: item.particulars,
          riskCategory: item.riskCategory,
          regulatoryRef: (item as any).regulatoryReference ?? null,
          displayOrder: item.displayOrder,
          isActive: true,
        },
      });
      itemCount++;
    }

    if (tid === tenantA.id) {
      console.log(
        `    ✓ ${examinationAreasData.length} areas, ${itemCount} items seeded for Tenant A`,
      );
    }
  }

  // ─── 5. Create Audit Areas ──────────────────────────────────────────

  console.log("  Creating audit areas...");

  const auditAreaData = [
    {
      name: "Credit Risk",
      description: "Credit appraisal, sanctioning, monitoring and recovery",
      riskCategory: "HIGH",
    },
    {
      name: "Operational Risk",
      description: "Cash management, reconciliation, and operational processes",
      riskCategory: "MEDIUM",
    },
    {
      name: "Compliance",
      description: "Regulatory compliance with RBI circulars and PMLA",
      riskCategory: "HIGH",
    },
    {
      name: "IT Systems",
      description: "Information security, CBS, and IT infrastructure",
      riskCategory: "HIGH",
    },
    {
      name: "Treasury",
      description: "Investment portfolio, SLR/CRR maintenance",
      riskCategory: "MEDIUM",
    },
    {
      name: "Deposit Operations",
      description: "Deposit mobilization, interest rate compliance",
      riskCategory: "LOW",
    },
    {
      name: "Governance",
      description: "Board oversight, committee functioning, policy adherence",
      riskCategory: "MEDIUM",
    },
  ];

  const auditAreas = await Promise.all(
    auditAreaData.map((a) =>
      prisma.auditArea.create({
        data: { ...a, tenantId: tenantA.id },
      }),
    ),
  );

  // Map area names to IDs for later reference
  const areaMap = new Map<string, string>();
  auditAreas.forEach((a) => areaMap.set(a.name, a.id));

  // Test Bank B audit area
  await prisma.auditArea.create({
    data: {
      name: "General Audit",
      description: "General audit area for testing",
      tenantId: tenantB.id,
    },
  });

  console.log(`    ✓ Created ${auditAreas.length} audit areas for Tenant A`);

  // ─── 6. Create RBI Circulars (global — no tenantId) ─────────────────

  console.log("  Creating RBI circulars...");

  const circularData = [
    {
      circularNumber: "RBI/2023-24/117",
      title: "Revised Basel III Capital Guidelines for UCBs",
      issuedDate: new Date("2023-10-20"),
    },
    {
      circularNumber: "RBI/2022-23/153",
      title: "Cyber Security Framework for UCBs",
      issuedDate: new Date("2022-12-15"),
    },
    {
      circularNumber: "RBI/2021-22/108",
      title: "Asset Liability Management Guidelines for UCBs",
      issuedDate: new Date("2021-09-30"),
    },
    {
      circularNumber: "RBI/2023-24/075",
      title: "KYC/AML Compliance for Co-operative Banks",
      issuedDate: new Date("2023-07-15"),
    },
    {
      circularNumber: "RBI/2024-25/012",
      title: "Priority Sector Lending Targets for UCBs",
      issuedDate: new Date("2024-04-10"),
    },
    {
      circularNumber: "RBI/2023-24/089",
      title: "Income Recognition and NPA Guidelines for UCBs",
      issuedDate: new Date("2023-08-20"),
    },
    {
      circularNumber: "RBI/2024-25/045",
      title: "Governance Standards for Urban Co-operative Banks",
      issuedDate: new Date("2024-06-15"),
    },
    {
      circularNumber: "RBI/2022-23/178",
      title: "Deposits and Interest Rate Guidelines",
      issuedDate: new Date("2023-02-10"),
    },
  ];

  const circulars = await Promise.all(
    circularData.map((c) => prisma.rbiCircular.create({ data: c })),
  );

  const circularMap = new Map<string, string>();
  circulars.forEach((c) => circularMap.set(c.circularNumber, c.id));

  console.log(`    ✓ Created ${circulars.length} RBI circulars (global)`);

  // ─── 7. Create Audit Plans with Indian Fiscal Year Quarters (D16) ───

  console.log("  Creating audit plans...");

  const auditPlanConfigs = [
    {
      year: 2025,
      quarter: Quarter.Q2_JUL_SEP,
      status: AuditPlanStatus.COMPLETED,
      startDate: "2025-07-15",
      endDate: "2025-09-30",
    },
    {
      year: 2025,
      quarter: Quarter.Q3_OCT_DEC,
      status: AuditPlanStatus.IN_PROGRESS,
      startDate: "2025-10-01",
      endDate: "2025-12-31",
    },
    {
      year: 2025,
      quarter: Quarter.Q4_JAN_MAR,
      status: AuditPlanStatus.PLANNED,
      startDate: "2026-01-01",
      endDate: "2026-03-31",
    },
    {
      year: 2026,
      quarter: Quarter.Q1_APR_JUN,
      status: AuditPlanStatus.PLANNED,
      startDate: "2026-04-01",
      endDate: "2026-06-30",
    },
  ];

  const auditPlans = await Promise.all(
    auditPlanConfigs.map((ap) =>
      prisma.auditPlan.create({
        data: {
          tenantId: tenantA.id,
          year: ap.year,
          quarter: ap.quarter,
          status: ap.status,
          startDate: new Date(ap.startDate),
          endDate: new Date(ap.endDate),
        },
      }),
    ),
  );

  // Test Bank B audit plan
  await prisma.auditPlan.create({
    data: {
      tenantId: tenantB.id,
      year: 2025,
      quarter: Quarter.Q3_OCT_DEC,
      status: AuditPlanStatus.PLANNED,
    },
  });

  console.log(`    ✓ Created ${auditPlans.length} audit plans for Tenant A`);

  // ─── 8. Create Audit Engagements ────────────────────────────────────

  console.log("  Creating audit engagements...");

  // Map branch codes to IDs
  const branchMap = new Map<string, string>();
  branches.forEach((b) => branchMap.set(b.code, b.id));

  const engagementData = [
    // Q2 2025 (completed)
    {
      planIdx: 0,
      branchCode: "BR002",
      area: "Credit Risk",
      status: EngagementStatus.COMPLETED,
      assignedTo: userCAE.id,
    },
    {
      planIdx: 0,
      branchCode: "BR004",
      area: "Operational Risk",
      status: EngagementStatus.COMPLETED,
      assignedTo: userAuditor.id,
    },
    // Q3 2025 (in progress)
    {
      planIdx: 1,
      branchCode: "BR001",
      area: "IT Systems",
      status: EngagementStatus.IN_PROGRESS,
      assignedTo: userAuditee.id,
    },
    {
      planIdx: 1,
      branchCode: "BR001",
      area: "Credit Risk",
      status: EngagementStatus.IN_PROGRESS,
      assignedTo: userCAE.id,
    },
    {
      planIdx: 1,
      branchCode: "BR007",
      area: "Treasury",
      status: EngagementStatus.PLANNED,
      assignedTo: userAuditor.id,
    },
    // Q4 2025 (planned)
    {
      planIdx: 2,
      branchCode: "BR001",
      area: "Compliance",
      status: EngagementStatus.PLANNED,
      assignedTo: userCCO.id,
    },
    {
      planIdx: 2,
      branchCode: "BR001",
      area: "Governance",
      status: EngagementStatus.PLANNED,
      assignedTo: userCAE.id,
    },
  ];

  let engagementCount = 0;
  for (const eng of engagementData) {
    await prisma.auditEngagement.create({
      data: {
        auditPlanId: auditPlans[eng.planIdx].id,
        tenantId: tenantA.id,
        branchId: branchMap.get(eng.branchCode) ?? null,
        auditAreaId: areaMap.get(eng.area) ?? null,
        assignedToId: eng.assignedTo,
        status: eng.status,
      },
    });
    engagementCount++;
  }

  console.log(
    `    ✓ Created ${engagementCount} audit engagements for Tenant A`,
  );

  // ─── 9. Create Compliance Requirements ──────────────────────────────

  console.log("  Creating compliance requirements...");

  // Map category IDs from demo data to RBI circular references
  const categoryToCircular: Record<string, string> = {
    "market-risk": "RBI/2023-24/117",
    "credit-risk": "RBI/2023-24/089",
    "kyc-aml": "RBI/2023-24/075",
    "it-security": "RBI/2022-23/153",
    governance: "RBI/2024-25/045",
    psl: "RBI/2024-25/012",
    alm: "RBI/2021-22/108",
    deposit: "RBI/2022-23/178",
  };

  // Load compliance data
  const complianceJson =
    await import("../src/data/seed/compliance-requirements.json");
  const complianceReqs = complianceJson.complianceRequirements;

  // Assign owner based on category
  const categoryOwnerMap: Record<string, string> = {
    "market-risk": userCCO.id,
    "credit-risk": userAuditor.id,
    "kyc-aml": userCCO.id,
    "it-security": userAuditee.id,
    governance: userCEO.id,
    psl: userAuditor.id,
    alm: userCCO.id,
    deposit: userAuditor.id,
    operations: userCAE.id,
    treasury: userAuditor.id,
  };

  let complianceCount = 0;
  for (const req of complianceReqs) {
    const circularRef = categoryToCircular[req.categoryId];
    await prisma.complianceRequirement.create({
      data: {
        tenantId: tenantA.id,
        requirement: `${req.title}: ${req.description}`,
        category: req.categoryId,
        status: mapComplianceStatus(req.status),
        rbiCircularId: circularRef
          ? (circularMap.get(circularRef) ?? null)
          : null,
        nextReviewDate: req.nextReviewDate
          ? new Date(req.nextReviewDate)
          : null,
        ownerId: categoryOwnerMap[req.categoryId] ?? userCCO.id,
      },
    });
    complianceCount++;
  }

  // Test Bank B compliance req
  await prisma.complianceRequirement.create({
    data: {
      tenantId: tenantB.id,
      requirement: "Maintain CRAR >= 9%",
      category: "market-risk",
      status: ComplianceStatus.PENDING,
      ownerId: userBankB.id,
    },
  });

  console.log(
    `    ✓ Created ${complianceCount} compliance requirements for Tenant A`,
  );

  // ─── 10. Create Observations (Findings) ─────────────────────────────

  console.log("  Creating observations...");

  const findingsJson = await import("../src/data/seed/findings.json");
  const findings = findingsJson.findings;

  // Map finding categories to audit area names
  const categoryToArea: Record<string, string> = {
    "Capital Adequacy": "Compliance",
    "Asset Liability Management": "Treasury",
    "Cyber Security": "IT Systems",
    "Credit Risk": "Credit Risk",
    Operations: "Operational Risk",
    Governance: "Governance",
    Treasury: "Treasury",
    "Deposit Operations": "Deposit Operations",
    "Priority Sector Lending": "Credit Risk",
  };

  // Assign auditors cyclically
  const auditorPool = [userCAE.id, userAuditor.id, userAuditee.id];

  let obsCount = 0;
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const areaName = categoryToArea[f.category] ?? "Operational Risk";
    const assignedToId = auditorPool[i % auditorPool.length];

    // Assign to a branch based on index
    const branchIdx = i % branches.length;

    const observation = await prisma.observation.create({
      data: {
        tenantId: tenantA.id,
        title: f.title,
        condition: f.observation,
        criteria: f.riskImpact,
        cause: f.rootCause,
        effect: f.riskImpact,
        recommendation: f.actionPlan,
        severity: mapSeverity(f.severity),
        status: mapObservationStatus(f.status),
        assignedToId,
        branchId: branches[branchIdx].id,
        auditAreaId: areaMap.get(areaName) ?? auditAreas[0].id,
        createdById: userCAE.id,
        dueDate: f.targetDate ? new Date(f.targetDate) : null,
        statusUpdatedAt: new Date(f.updatedAt),
      },
    });

    // Create timeline events for this observation
    if (f.timeline && f.timeline.length > 0) {
      for (const tl of f.timeline) {
        await prisma.observationTimeline.create({
          data: {
            observationId: observation.id,
            tenantId: tenantA.id,
            event: tl.action,
            createdById: userCAE.id, // Simplified — assign to CAE
            createdAt: new Date(tl.date),
          },
        });
      }
    }

    obsCount++;
  }

  // Test Bank B observation
  await prisma.observation.create({
    data: {
      tenantId: tenantB.id,
      title: "Test Bank Finding — Cash Reserve",
      condition: "CRR maintenance below threshold",
      criteria: "RBI minimum CRR requirement",
      cause: "Liquidity management gap",
      effect: "Regulatory penalty risk",
      recommendation: "Improve daily CRR monitoring",
      severity: Severity.MEDIUM,
      status: ObservationStatus.DRAFT,
      branchId: branchB.id,
      createdById: userBankB.id,
    },
  });

  console.log(
    `    ✓ Created ${obsCount} observations with timeline events for Tenant A`,
  );

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 2-6: New module seeders
  // ═══════════════════════════════════════════════════════════════════════════════

  // ─── Phase 3: Audit Universe Entities ────────────────────────────────────────
  console.log("  Seeding audit universe entities...");
  const auditUniverseData = await import(
    "../src/data/seed/audit-universe.json",
    {
      with: { type: "json" },
    }
  ).then((m) => m.default);

  const entityIdMap = new Map<string, string>();
  for (const entity of auditUniverseData) {
    const branchId = entity.branchCode
      ? (branchMap.get(entity.branchCode) ?? null)
      : null;

    const created = await prisma.auditUniverseEntity.create({
      data: {
        id: entity.id,
        tenantId: tenantA.id,
        entityType: entity.entityType,
        name: entity.name,
        description: entity.description,
        branchId,
        riskScore: entity.riskScore,
        lastAuditDate: entity.lastAuditDate
          ? new Date(entity.lastAuditDate)
          : null,
        lastAuditRating: entity.lastAuditRating,
        requiredFrequency: entity.requiredFrequency,
      },
    });
    entityIdMap.set(entity.id, created.id);
  }
  console.log(
    `    ✓ Created ${auditUniverseData.length} audit universe entities`,
  );

  // ─── Phase 3: Risk Registers with KRIs ──────────────────────────────────────
  console.log("  Seeding risk registers...");
  const riskRegistersData = await import(
    "../src/data/seed/risk-registers.json",
    {
      with: { type: "json" },
    }
  ).then((m) => m.default);

  let riskCount = 0;
  let kriCount = 0;
  for (const risk of riskRegistersData) {
    const riskRecord = await prisma.riskRegister.create({
      data: {
        id: risk.id,
        tenant: { connect: { id: tenantA.id } },
        entity: { connect: { id: risk.entityId } },
        riskStatement: risk.riskStatement,
        riskCategory: risk.riskCategory,
        inherentScore: risk.inherentScore,
        controlScore: risk.controlScore,
        residualScore: risk.residualScore,
        riskOwner: risk.riskOwner,
        mitigationPlan: risk.mitigationPlan,
        status: risk.status,
      },
    });
    riskCount++;

    // Create KRIs if present
    if (risk.kris && risk.kris.length > 0) {
      for (const kri of risk.kris) {
        await prisma.keyRiskIndicator.create({
          data: {
            tenant: { connect: { id: tenantA.id } },
            riskRegister: { connect: { id: riskRecord.id } },
            name: kri.name,
            description: kri.description,
            currentValue: kri.currentValue,
            thresholdLow: kri.thresholdLow,
            thresholdHigh: kri.thresholdHigh,
            breachStatus: kri.breachStatus,
            frequency: kri.frequency,
          },
        });
        kriCount++;
      }
    }
  }
  console.log(
    `    ✓ Created ${riskCount} risk registers with ${kriCount} KRIs`,
  );

  // ─── Phase 3: Control Library with Test Procedures ──────────────────────────
  console.log("  Seeding control library...");
  const controlsData = await import("../src/data/seed/controls.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  let controlCount = 0;
  let testProcCount = 0;
  for (const control of controlsData) {
    const controlRecord = await prisma.controlLibrary.create({
      data: {
        id: control.id,
        tenant: { connect: { id: tenantA.id } },
        controlCode: control.controlCode,
        processArea: control.processArea,
        controlType: control.controlType,
        frequency: control.frequency,
        owner: control.owner,
        isKeyControl: control.isKeyControl,
        description: control.description,
        frameworkMapping: control.frameworkMapping,
        effectivenessScore: control.effectivenessScore,
        lastTestedDate: control.lastTestedDate
          ? new Date(control.lastTestedDate)
          : null,
      },
    });
    controlCount++;

    // Create test procedures if present
    if (control.testProcedures && control.testProcedures.length > 0) {
      for (const proc of control.testProcedures) {
        await prisma.testProcedure.create({
          data: {
            tenant: { connect: { id: tenantA.id } },
            control: { connect: { id: controlRecord.id } },
            name: proc.name,
            description: proc.description,
            sampleMethodology: proc.sampleMethodology,
            sampleSize: proc.sampleSize,
            expectedEvidence: proc.expectedEvidence,
            passCriteria: proc.passCriteria,
          },
        });
        testProcCount++;
      }
    }
  }
  console.log(
    `    ✓ Created ${controlCount} controls with ${testProcCount} test procedures`,
  );

  // ─── Phase 3: Issues with Action Plans ──────────────────────────────────────
  console.log("  Seeding issues...");
  const issuesData = await import("../src/data/seed/issues-seed.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  let issueCount = 0;
  let actionPlanCount = 0;
  for (const issue of issuesData) {
    const issueRecord = await prisma.issue.create({
      data: {
        id: issue.id,
        tenant: { connect: { id: tenantA.id } },
        title: issue.title,
        description: issue.description,
        source: issue.source,
        issueType: issue.issueType,
        severity: issue.severity,
        rootCause: issue.rootCause,
        riskTheme: issue.riskTheme,
        status: issue.status,
        closedAt: issue.closedAt ? new Date(issue.closedAt) : null,
        acceptedAt: issue.acceptedAt ? new Date(issue.acceptedAt) : null,
        acceptanceReason: issue.acceptanceReason,
      },
    });
    issueCount++;

    // Create action plans if present
    if (issue.actionPlans && issue.actionPlans.length > 0) {
      for (const ap of issue.actionPlans) {
        await prisma.actionPlan.create({
          data: {
            tenant: { connect: { id: tenantA.id } },
            issue: { connect: { id: issueRecord.id } },
            title: ap.title,
            description: ap.description,
            milestone: ap.milestone,
            dueDate: new Date(ap.dueDate),
            status: ap.status,
            evidence: ap.evidence || [],
            verifiedAt: ap.verifiedAt ? new Date(ap.verifiedAt) : null,
            completionPct: ap.completionPct,
          },
        });
        actionPlanCount++;
      }
    }
  }
  console.log(
    `    ✓ Created ${issueCount} issues with ${actionPlanCount} action plans`,
  );

  // ─── Phase 3: QA Self-Assessment ────────────────────────────────────────────
  console.log("  Seeding QA self-assessments...");
  const qaAssessmentData = await import(
    "../src/data/seed/qa-assessment-seed.json",
    {
      with: { type: "json" },
    }
  ).then((m) => m.default);

  for (const qa of qaAssessmentData) {
    await prisma.qaSelfAssessment.create({
      data: {
        id: qa.id,
        tenantId: tenantA.id,
        assessmentYear: qa.assessmentYear,
        iiaStandard: qa.iiaStandard,
        question: qa.question,
        response: qa.response,
        evidence: qa.evidence,
        gapIdentified: qa.gapIdentified,
        issueCreated: qa.issueCreated,
      },
    });
  }
  console.log(`    ✓ Created ${qaAssessmentData.length} QA assessment entries`);

  // ─── Phase 2: Report Templates ───────────────────────────────────────────────
  console.log("  Seeding report templates...");
  const reportTemplatesData = await import(
    "../src/data/seed/report-templates.json",
    {
      with: { type: "json" },
    }
  ).then((m) => m.default);

  for (const template of reportTemplatesData) {
    await prisma.reportTemplate.create({
      data: {
        id: template.id,
        tenantId: tenantA.id,
        name: template.name,
        category: template.category,
        versionNumber: template.versionNumber,
        isActive: template.isActive,
        templateData: template.templateData,
        createdById: userCAE.id,
      },
    });
  }
  console.log(`    ✓ Created ${reportTemplatesData.length} report templates`);

  // ─── Phase 2: Calendar Events ────────────────────────────────────────────────
  console.log("  Seeding calendar events...");
  const calendarEventsData = await import(
    "../src/data/seed/calendar-events.json",
    {
      with: { type: "json" },
    }
  ).then((m) => m.default);

  for (const event of calendarEventsData) {
    const branchId = event.branchCode
      ? (branchMap.get(event.branchCode) ?? null)
      : null;

    await prisma.auditCalendar.create({
      data: {
        id: event.id,
        tenantId: tenantA.id,
        title: event.title,
        eventType: event.eventType,
        startDate: new Date(event.startDate),
        endDate: event.endDate ? new Date(event.endDate) : null,
        allDay: event.allDay,
        branchId,
        recurrenceRule: event.recurrenceRule,
        description: event.description,
      },
    });
  }
  console.log(`    ✓ Created ${calendarEventsData.length} calendar events`);

  // ─── Phase 4: Concurrent Audit Templates ─────────────────────────────────────
  console.log("  Seeding concurrent audit templates...");
  const concurrentTemplatesData = await import(
    "../src/data/seed/concurrent-templates.json",
    { with: { type: "json" } }
  ).then((m) => m.default);

  for (const template of concurrentTemplatesData) {
    await prisma.concurrentAuditTemplate.create({
      data: {
        id: template.id,
        tenantId: tenantA.id,
        scopeArea: template.scopeArea,
        name: template.name,
        description: template.description,
        checklistItems: template.checklistItems,
        isActive: template.isActive,
      },
    });
  }
  console.log(
    `    ✓ Created ${concurrentTemplatesData.length} concurrent audit templates`,
  );

  // ─── Phase 4: Regulatory Observations ────────────────────────────────────────
  console.log("  Seeding regulatory observations...");
  const regulatoryObsData = await import(
    "../src/data/seed/regulatory-observations.json",
    { with: { type: "json" } }
  ).then((m) => m.default);

  for (const obs of regulatoryObsData) {
    await prisma.regulatoryObservation.create({
      data: {
        id: obs.id,
        tenantId: tenantA.id,
        source: obs.source,
        referenceNo: obs.referenceNo,
        paraNo: obs.paraNo,
        description: obs.description,
        severity: obs.severity,
        atrStatus: obs.atrStatus,
        atrText: obs.atrText,
        submittedAt: obs.submittedAt ? new Date(obs.submittedAt) : null,
        acceptedAt: obs.acceptedAt ? new Date(obs.acceptedAt) : null,
      },
    });
  }
  console.log(
    `    ✓ Created ${regulatoryObsData.length} regulatory observations`,
  );

  // ─── Phase 4: Policy Documents ───────────────────────────────────────────────
  console.log("  Seeding policy documents...");
  const policiesData = await import("../src/data/seed/policies.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  for (const policy of policiesData) {
    await prisma.policyDocument.create({
      data: {
        id: policy.id,
        tenantId: tenantA.id,
        name: policy.name,
        category: policy.category,
        approvalDate: policy.approvalDate
          ? new Date(policy.approvalDate)
          : null,
        reviewDueDate: policy.reviewDueDate
          ? new Date(policy.reviewDueDate)
          : null,
        version: policy.version,
        status: policy.status,
        documentUrl: policy.documentUrl,
        summary: policy.summary,
      },
    });
  }
  console.log(`    ✓ Created ${policiesData.length} policy documents`);

  // ─── Phase 4: Committees ─────────────────────────────────────────────────────
  console.log("  Seeding committees...");
  const committeesData = await import("../src/data/seed/committees.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  for (const committee of committeesData) {
    const committeeRecord = await prisma.committee.create({
      data: {
        id: committee.id,
        tenantId: tenantA.id,
        name: committee.name,
        description: committee.description,
        isActive: committee.isActive,
      },
    });

    // Create committee members — map placeholder names to seeded users, skip duplicates
    if (committee.members && committee.members.length > 0) {
      const seenUserIds = new Set<string>();
      const userPool = [
        userCAE.id,
        userCEO.id,
        userCCO.id,
        userAuditor.id,
        userAuditee.id,
      ];
      let poolIdx = 0;

      for (const member of committee.members) {
        let userId: string;
        if (member.name === "Rajesh Deshmukh") userId = userCEO.id;
        else if (member.name === "Priya Sharma") userId = userCAE.id;
        else if (member.name === "Amit Joshi") userId = userCCO.id;
        else {
          // Round-robin through available users for unrecognized names
          userId = userPool[poolIdx % userPool.length];
          poolIdx++;
        }

        // Skip duplicate (committeeId, userId) pairs
        if (seenUserIds.has(userId)) continue;
        seenUserIds.add(userId);

        await prisma.committeeMember.create({
          data: {
            committee: { connect: { id: committeeRecord.id } },
            user: { connect: { id: userId } },
            role: member.role,
          },
        });
      }
    }
  }
  console.log(`    ✓ Created ${committeesData.length} committees`);

  // ─── R83: Board Review Calendar (CommitteeMeeting records) ─────────────────
  // 10 meetings matching RBI-mandated items from board-review-calendar.tsx
  // Spread across FY 2025-26 (Apr 2025 – Mar 2026)
  console.log("  Seeding committee meetings (board review calendar)...");

  const acbCommitteeId = "b0000000-0000-0000-0000-000000000131";
  const riskCommitteeId = "b0000000-0000-0000-0000-000000000132";
  const itCommitteeId = "b0000000-0000-0000-0000-000000000134";

  const committeeMeetingData = [
    // 1. ACB Meeting — Quarterly Review (Q1: Jun 2025) — COMPLETED
    {
      committeeId: acbCommitteeId,
      meetingDate: new Date("2025-06-28T10:00:00+05:30"),
      status: "COMPLETED",
      agendaItems: [
        "Q1 FY2025-26 Internal Audit Report",
        "Compliance status review",
        "Status of pending observations",
        "Risk assessment update",
      ],
      attendees: [userCEO.id, userCAE.id, userCCO.id],
    },
    // 2. IS Audit Report to Board (Annual: Mar 2026) — SCHEDULED
    {
      committeeId: acbCommitteeId,
      meetingDate: new Date("2026-03-14T10:00:00+05:30"),
      status: "SCHEDULED",
      agendaItems: [
        "IS Audit Report FY2025-26",
        "Cyber security posture assessment",
        "Technology risk review",
        "IT governance compliance",
      ],
      attendees: [userCEO.id, userCAE.id],
    },
    // 3. Concurrent Audit Report (Q1: Jun 2025) — COMPLETED
    {
      committeeId: acbCommitteeId,
      meetingDate: new Date("2025-06-28T14:00:00+05:30"),
      status: "COMPLETED",
      agendaItems: [
        "Concurrent audit findings — Q1",
        "Irregularity escalation summary",
        "Branch-wise exception analysis",
      ],
      attendees: [userCEO.id, userCAE.id, userCCO.id],
    },
    // 4. RBIA Plan Approval (Annual: Mar 2026) — SCHEDULED
    {
      committeeId: acbCommitteeId,
      meetingDate: new Date("2026-03-21T10:00:00+05:30"),
      status: "SCHEDULED",
      agendaItems: [
        "Risk-Based Internal Audit Plan FY2026-27",
        "Risk appetite review",
        "Audit resource allocation",
        "Branch prioritization matrix",
      ],
      attendees: [userCEO.id, userCAE.id, userCCO.id],
    },
    // 5. Risk Management Policy Review (Annual: Jun 2025) — COMPLETED
    {
      committeeId: riskCommitteeId,
      meetingDate: new Date("2025-06-14T10:00:00+05:30"),
      status: "COMPLETED",
      agendaItems: [
        "Annual risk management policy review",
        "Risk appetite statement update",
        "ICAAP document review",
        "Stress testing results",
      ],
      attendees: [userCEO.id, userCCO.id],
    },
    // 6. KYC/AML Policy Review (Annual: Sep 2025) — COMPLETED
    {
      committeeId: acbCommitteeId,
      meetingDate: new Date("2025-09-20T10:00:00+05:30"),
      status: "COMPLETED",
      agendaItems: [
        "KYC/AML policy annual review",
        "STR filing statistics",
        "PMLA compliance status",
        "Customer due diligence gaps",
      ],
      attendees: [userCEO.id, userCAE.id, userCCO.id],
    },
    // 7. Cyber Security Review (Half-yearly: Sep 2025) — COMPLETED
    {
      committeeId: itCommitteeId,
      meetingDate: new Date("2025-09-27T10:00:00+05:30"),
      status: "COMPLETED",
      agendaItems: [
        "H1 cyber security review",
        "Vulnerability assessment results",
        "Phishing simulation report",
        "BCP/DR test results",
      ],
      attendees: [userCEO.id, userCAE.id],
    },
    // 8. Investment Policy Review (Annual: Jun 2025) — COMPLETED
    {
      committeeId: acbCommitteeId,
      meetingDate: new Date("2025-06-21T10:00:00+05:30"),
      status: "COMPLETED",
      agendaItems: [
        "Investment policy annual review",
        "SLR/non-SLR portfolio analysis",
        "Broker concentration review",
        "HTM/AFS/HFT classification compliance",
      ],
      attendees: [userCEO.id, userCAE.id, userCCO.id],
    },
    // 9. Statutory Audit Report Discussion (Annual: Jun 2025) — COMPLETED
    {
      committeeId: acbCommitteeId,
      meetingDate: new Date("2025-06-07T10:00:00+05:30"),
      status: "COMPLETED",
      agendaItems: [
        "Statutory audit report FY2024-25",
        "Auditor observations and management responses",
        "Long-form audit report review",
        "Action plan for statutory audit findings",
      ],
      attendees: [userCEO.id, userCAE.id, userCCO.id],
    },
    // 10. RBI Inspection Report Discussion (As needed: Nov 2025) — COMPLETED
    {
      committeeId: acbCommitteeId,
      meetingDate: new Date("2025-11-15T10:00:00+05:30"),
      status: "COMPLETED",
      agendaItems: [
        "RBI inspection report FY2024-25 discussion",
        "Action taken report preparation",
        "Compliance deficiency resolution timeline",
        "DAKSH score improvement plan",
      ],
      attendees: [userCEO.id, userCAE.id, userCCO.id],
    },
  ];

  for (const meeting of committeeMeetingData) {
    await prisma.committeeMeeting.create({
      data: {
        committee: { connect: { id: meeting.committeeId } },
        tenant: { connect: { id: tenantA.id } },
        meetingDate: meeting.meetingDate,
        status: meeting.status,
        agendaItems: meeting.agendaItems,
        attendees: meeting.attendees,
      },
    });
  }
  console.log(
    `    ✓ Created ${committeeMeetingData.length} committee meetings (board review calendar)`,
  );

  // ─── Phase 4: Housekeeping Metrics ───────────────────────────────────────────
  console.log("  Seeding housekeeping metrics...");
  const housekeepingData = await import(
    "../src/data/seed/housekeeping-metrics.json",
    { with: { type: "json" } }
  ).then((m) => m.default);

  for (const metric of housekeepingData) {
    const branchId = branchMap.get(metric.branchCode);
    if (!branchId) continue;

    await prisma.housekeepingMetric.create({
      data: {
        id: metric.id,
        tenant: { connect: { id: tenantA.id } },
        branch: { connect: { id: branchId } },
        metricType: metric.metricType,
        period: metric.period,
        openingBalance: metric.openingBalance,
        closingBalance: metric.closingBalance,
        entriesCount: metric.entriesCount,
        agingDays: metric.agingDays,
        remarks: metric.remarks,
      },
    });
  }
  console.log(`    ✓ Created ${housekeepingData.length} housekeeping metrics`);

  // ─── Phase 6: Investment Records ─────────────────────────────────────────────
  console.log("  Seeding investment records...");
  const investmentsData = await import("../src/data/seed/investments.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  for (const investment of investmentsData) {
    await prisma.investmentRecord.create({
      data: {
        id: investment.id,
        tenant: { connect: { id: tenantA.id } },
        securityType: investment.securityType,
        classification: investment.classification,
        isin: investment.isin,
        faceValue: investment.faceValue,
        bookValue: investment.bookValue,
        marketValue: investment.marketValue,
        brokerName: investment.brokerName,
        brokerShare: investment.brokerShare,
        sglAccount: investment.sglAccount,
        reconciled: investment.reconciled,
        period: investment.period,
      },
    });
  }
  console.log(`    ✓ Created ${investmentsData.length} investment records`);

  // ─── Phase 6: Application Inventory ──────────────────────────────────────────
  console.log("  Seeding application inventory...");
  const appInventoryData = await import("../src/data/seed/app-inventory.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  for (const app of appInventoryData) {
    await prisma.applicationInventory.create({
      data: {
        id: app.id,
        tenant: { connect: { id: tenantA.id } },
        appName: app.appName,
        vendor: app.vendor,
        version: app.version,
        hostingType: app.hostingType,
        criticality: app.criticality,
        drTested: app.drTested,
        lastDrTestDate: app.lastDrTestDate
          ? new Date(app.lastDrTestDate)
          : null,
        lastIsAuditDate: app.lastIsAuditDate
          ? new Date(app.lastIsAuditDate)
          : null,
        dataClassification: app.dataClassification,
        description: app.description,
      },
    });
  }
  console.log(
    `    ✓ Created ${appInventoryData.length} application inventory entries`,
  );

  // ─── Phase 6: IS Audit Checklists ────────────────────────────────────────────
  console.log("  Seeding IS audit checklists...");
  const isChecklistsData = await import("../src/data/seed/is-checklists.json", {
    with: { type: "json" },
  }).then((m) => m.default);

  for (const checklist of isChecklistsData) {
    await prisma.isAuditChecklist.create({
      data: {
        id: checklist.id,
        tenant: { connect: { id: tenantA.id } },
        category: checklist.category,
        checklistName: checklist.checklistName,
        items: checklist.items,
        completedAt: checklist.completedAt
          ? new Date(checklist.completedAt)
          : null,
        overallRating: checklist.overallRating,
      },
    });
  }
  console.log(`    ✓ Created ${isChecklistsData.length} IS audit checklists`);

  // ─── Summary ────────────────────────────────────────────────────────

  console.log("\n✅ Seed complete!\n");
  console.log("  Tenant A (Apex Sahakari Bank):");
  console.log(`    - ${allUsersA.length} users (2 multi-role)`);
  console.log(`    - ${zones.length} zones`);
  console.log(`    - ${branches.length} branches`);
  console.log(`    - ${auditAreas.length} audit areas`);
  console.log(
    `    - ${auditPlans.length} audit plans (Indian fiscal quarters)`,
  );
  console.log(`    - ${engagementCount} audit engagements`);
  console.log(`    - ${complianceCount} compliance requirements`);
  console.log(`    - ${obsCount} observations with timeline events`);
  console.log(
    `    - ${committeeMeetingData.length} committee meetings (board review calendar)`,
  );
  console.log("  Tenant B (Test Nagari Sahakari Bank):");
  console.log("    - 1 user (CEO+CAE dual role)");
  console.log("    - 1 branch, 1 audit area, 1 audit plan");
  console.log("    - 1 compliance requirement, 1 observation");
  console.log(`\n  Global: ${circulars.length} RBI circulars\n`);
}

// Seeded rows carry no audit history by design: there is no Actor to
// attribute them to, and fabricating a trail for demo data would be dishonest
// in a product sold on audit integrity. Without this the trigger inserts a
// NULL tenantId into AuditLog's NOT NULL column and the seed aborts — which is
// what forced a manual DROP TRIGGER during the 2026-08 bootstrap.
withTriggersDetached(prisma, main)
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
