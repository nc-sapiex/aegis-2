-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('AUDITOR', 'AUDIT_MANAGER', 'CAE', 'CCO', 'CEO', 'AUDITEE', 'BOARD_OBSERVER', 'LEAD_AUDITOR', 'FIELD_AUDITOR', 'BRANCH_HEAD', 'ZONAL_AUDITOR', 'ACE_OFFICER', 'CONCURRENT_AUDITOR', 'IS_AUDITOR', 'RISK_HEAD', 'ACB_MEMBER', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ObservationStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'REVIEWED', 'ISSUED', 'RESPONSE', 'COMPLIANCE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('COMPLIANT', 'PARTIAL', 'NON_COMPLIANT', 'PENDING', 'OPEN', 'BRANCH_RESPONSE_DUE', 'BRANCH_RESPONSE_SUBMITTED', 'ZAC_REVIEW', 'ZAC_APPROVED', 'ZAC_REJECTED', 'ACE_REVIEW', 'ACB_REVIEW', 'CLOSED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "UcbTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3', 'TIER_4');

-- CreateEnum
CREATE TYPE "PcaStatus" AS ENUM ('NONE', 'PCA_1', 'PCA_2', 'PCA_3');

-- CreateEnum
CREATE TYPE "Quarter" AS ENUM ('Q1_APR_JUN', 'Q2_JUL_SEP', 'Q3_OCT_DEC', 'Q4_JAN_MAR');

-- CreateEnum
CREATE TYPE "RamAssessmentStatus" AS ENUM ('DRAFT', 'COMPUTED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ExaminationStatus" AS ENUM ('PENDING', 'COMPLIANT', 'NON_COMPLIANT', 'PARTIAL', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "AuditSectionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "AuditPlanStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EngagementStatus" AS ENUM ('PLANNED', 'TEAM_ASSIGNED', 'OPENING_MEETING', 'IN_PROGRESS', 'EXIT_MEETING', 'REPORT_DRAFT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScoreLabel" AS ENUM ('FULLY_COMPLIANT', 'LARGELY_COMPLIANT', 'PARTIALLY_COMPLIANT', 'NON_COMPLIANT');

-- CreateEnum
CREATE TYPE "ActionPointStatus" AS ENUM ('DRAFT', 'ISSUED', 'BM_RESPONSE_DUE', 'BM_RESPONDED', 'VERIFIED', 'CLOSED', 'CARRIED_FORWARD');

-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('OPENING', 'EXIT');

-- CreateEnum
CREATE TYPE "BmBatchStatus" AS ENUM ('PENDING', 'SUBMITTED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "AccountExamResponseStatus" AS ENUM ('COMPLIANT', 'VIOLATION');

-- CreateEnum
CREATE TYPE "ResponseType" AS ENUM ('CLARIFICATION', 'COMPLIANCE_ACTION', 'REQUEST_EXTENSION');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('OBSERVATION_ASSIGNED', 'RESPONSE_SUBMITTED', 'DEADLINE_REMINDER_7D', 'DEADLINE_REMINDER_3D', 'DEADLINE_REMINDER_1D', 'OVERDUE_ESCALATION', 'WEEKLY_DIGEST', 'BULK_DIGEST', 'INVITATION');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('OBSERVATION_EVIDENCE', 'EXAMINATION_EVIDENCE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "rbiLicenseNo" TEXT NOT NULL,
    "tier" "UcbTier" NOT NULL,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT,
    "pincode" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "incorporationDate" TIMESTAMP(3),
    "scheduledBankStatus" BOOLEAN NOT NULL DEFAULT false,
    "nabardRegistrationNo" TEXT,
    "multiStateLicense" BOOLEAN NOT NULL DEFAULT false,
    "dakshScore" DECIMAL(5,2),
    "dakshScoreDate" TIMESTAMP(3),
    "pcaStatus" "PcaStatus" NOT NULL DEFAULT 'NONE',
    "pcaEffectiveDate" TIMESTAMP(3),
    "lastRbiInspectionDate" TIMESTAMP(3),
    "rbiRiskRating" TEXT,
    "established" TIMESTAMP(3),
    "pan" TEXT,
    "cin" TEXT,
    "registrationNo" TEXT,
    "registeredWith" TEXT,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompletedAt" TIMESTAMP(3),
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "roles" "Role"[],
    "tenantId" UUID,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "invitedAt" TIMESTAMP(3),
    "invitedBy" UUID,
    "inviteTokenHash" TEXT,
    "inviteExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "status" "ObservationStatus" NOT NULL DEFAULT 'DRAFT',
    "assignedToId" UUID,
    "branchId" UUID,
    "auditAreaId" UUID,
    "createdById" UUID NOT NULL,
    "dueDate" TIMESTAMP(3),
    "responseDueDate" TIMESTAMP(3),
    "statusUpdatedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "resolvedDuringFieldwork" BOOLEAN NOT NULL DEFAULT false,
    "resolutionReason" TEXT,
    "auditeeResponse" TEXT,
    "actionPlan" TEXT,
    "riskCategory" TEXT,
    "observationType" TEXT NOT NULL DEFAULT 'AUTO_LEGACY',
    "sourceActionPointId" UUID,
    "engagementId" UUID,
    "repeatOfId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservationTimeline" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "observationId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "comment" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationTimeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservationRbiCircular" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "observationId" UUID NOT NULL,
    "rbiCircularId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ObservationRbiCircular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evidence" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "observationId" UUID,
    "examinationResponseId" UUID,
    "tenantId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "contentType" TEXT NOT NULL,
    "description" TEXT,
    "uploadedById" UUID NOT NULL,
    "newExaminationResponseId" UUID,
    "actionPointId" UUID,
    "accountExamResponseId" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadIntent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "s3Key" TEXT NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "parentId" UUID NOT NULL,
    "contentType" TEXT NOT NULL,
    "maxFileSize" INTEGER NOT NULL,
    "createdById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceRequirement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "requirement" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'PENDING',
    "title" TEXT,
    "description" TEXT,
    "priority" TEXT,
    "frequency" TEXT,
    "evidenceRequired" TEXT[],
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "sourceItemCode" TEXT,
    "rbiCircularId" UUID,
    "nextReviewDate" TIMESTAMP(3),
    "notApplicableReason" TEXT,
    "ownerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RbiCircular" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "circularNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "issuedDate" TIMESTAMP(3) NOT NULL,
    "url" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RbiCircular_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "type" TEXT,
    "zoneId" UUID,
    "category" TEXT,
    "businessSize" DECIMAL(15,2),
    "staffStrength" INTEGER,
    "ramScore" DECIMAL(5,2),
    "auditFrequency" INTEGER,
    "lastAuditDate" TIMESTAMP(3),
    "lastAuditRating" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditArea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "riskCategory" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" "Quarter" NOT NULL,
    "status" "AuditPlanStatus" NOT NULL DEFAULT 'PLANNED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEngagement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "auditPlanId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "auditAreaId" UUID,
    "assignedToId" UUID,
    "status" "EngagementStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledStartDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "auditNumber" TEXT,
    "auditType" TEXT DEFAULT 'RBIA',
    "visitNumber" INTEGER DEFAULT 1,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "actualStartDate" TIMESTAMP(3),
    "actualEndDate" TIMESTAMP(3),
    "overallRiskRating" TEXT,
    "bhCertSignedById" UUID,
    "bhCertSignedAt" TIMESTAMP(3),
    "bhCertComments" TEXT,
    "bhCertCountersignedById" UUID,
    "bhCertCountersignedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "reportStatus" TEXT DEFAULT 'DRAFT',
    "reportReviewedById" UUID,
    "reportReviewedAt" TIMESTAMP(3),
    "reportApprovedById" UUID,
    "reportApprovedAt" TIMESTAMP(3),
    "reportIssuedById" UUID,
    "reportIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hiaClosedById" UUID,
    "hiaClosedAt" TIMESTAMP(3),
    "closureRemarks" TEXT,
    "allItemsResolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AuditEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTeamMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleInEngagement" TEXT NOT NULL,
    "assignedSections" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditTeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RamParameterConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "weight" DECIMAL(5,4) NOT NULL,
    "maxScore" DECIMAL(5,2) NOT NULL DEFAULT 5,
    "scoringCriteria" JSONB NOT NULL,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RamParameterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RamAssessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "assessmentYear" TEXT NOT NULL,
    "compositeScore" DECIMAL(5,2),
    "riskCategory" TEXT,
    "auditFrequency" INTEGER,
    "rawCompositeScore" DECIMAL(5,2),
    "repeatUpliftApplied" BOOLEAN NOT NULL DEFAULT false,
    "repeatFindingCount" INTEGER NOT NULL DEFAULT 0,
    "status" "RamAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "computedById" UUID,
    "computedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RamAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RamAssessmentScore" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assessmentId" UUID NOT NULL,
    "paramConfigId" UUID NOT NULL,
    "score" DECIMAL(5,2) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RamAssessmentScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExaminationArea" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "riskWeight" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExaminationArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExaminationItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "itemNumber" TEXT NOT NULL,
    "particulars" TEXT NOT NULL,
    "riskCategory" TEXT,
    "regulatoryRef" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExaminationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditExaminationResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "status" "ExaminationStatus" NOT NULL DEFAULT 'PENDING',
    "observation" TEXT,
    "riskRating" TEXT,
    "respondedById" UUID,
    "respondedAt" TIMESTAMP(3),
    "observationId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditExaminationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditSectionInstance" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "sectionCode" TEXT NOT NULL,
    "sectionName" TEXT NOT NULL,
    "status" "AuditSectionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sectionData" JSONB,
    "assignedToId" UUID,
    "completedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditSectionInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashCheck" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "cashInHand" DECIMAL(15,2) NOT NULL,
    "bookBalance" DECIMAL(15,2) NOT NULL,
    "difference" DECIMAL(15,2) NOT NULL,
    "retentionLimit" DECIMAL(15,2),
    "atmBalances" JSONB,
    "denominationData" JSONB,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanReview" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "accountNo" TEXT NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "sanctionAmount" DECIMAL(15,2) NOT NULL,
    "outstandingAmount" DECIMAL(15,2) NOT NULL,
    "assetClass" TEXT NOT NULL,
    "dpd" INTEGER NOT NULL DEFAULT 0,
    "auditObservation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmaNpaEntry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "accountCount" INTEGER NOT NULL,
    "totalAmount" DECIMAL(15,2) NOT NULL,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmaNpaEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "observationId" UUID NOT NULL,
    "auditId" UUID,
    "branchId" UUID,
    "status" "ComplianceStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "daysOpen" INTEGER NOT NULL DEFAULT 0,
    "branchResponseText" TEXT,
    "branchResponseDate" TIMESTAMP(3),
    "branchResponseEvidence" TEXT[],
    "zacReviewedById" UUID,
    "zacReviewedAt" TIMESTAMP(3),
    "zacReviewComments" TEXT,
    "zacReviewDecision" TEXT,
    "aceReviewedById" UUID,
    "aceReviewedAt" TIMESTAMP(3),
    "aceQuarter" TEXT,
    "acbReportedAt" TIMESTAMP(3),
    "acbMeetingRef" TEXT,
    "closedAt" TIMESTAMP(3),
    "closedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "templateData" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditCalendar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "branchId" UUID,
    "engagementId" UUID,
    "recurrenceRule" TEXT,
    "description" TEXT,
    "assignedToId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditUniverseEntity" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "branchId" UUID,
    "riskScore" DECIMAL(5,2),
    "lastAuditDate" TIMESTAMP(3),
    "lastAuditRating" TEXT,
    "requiredFrequency" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditUniverseEntity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskRegister" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "riskStatement" TEXT NOT NULL,
    "riskCategory" TEXT NOT NULL,
    "inherentScore" DECIMAL(5,2) NOT NULL,
    "controlScore" DECIMAL(5,2) NOT NULL,
    "residualScore" DECIMAL(5,2) NOT NULL,
    "riskOwner" TEXT,
    "mitigationPlan" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskRegister_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KeyRiskIndicator" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "riskRegisterId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currentValue" DECIMAL(15,4),
    "thresholdLow" DECIMAL(15,4),
    "thresholdHigh" DECIMAL(15,4),
    "breachStatus" TEXT NOT NULL DEFAULT 'NORMAL',
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "lastUpdated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KeyRiskIndicator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAuditLinkage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "entityId" UUID NOT NULL,
    "riskRegisterId" UUID NOT NULL,
    "engagementId" UUID,
    "thematicArea" TEXT NOT NULL,
    "linkageType" TEXT NOT NULL DEFAULT 'DIRECT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskAuditLinkage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlLibrary" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "controlCode" TEXT NOT NULL,
    "processArea" TEXT NOT NULL,
    "controlType" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "owner" TEXT,
    "isKeyControl" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "frameworkMapping" JSONB,
    "effectivenessScore" DECIMAL(5,2),
    "lastTestedDate" TIMESTAMP(3),
    "riskRegisterId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControlLibrary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestProcedure" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "controlId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sampleMethodology" TEXT,
    "sampleSize" INTEGER,
    "expectedEvidence" TEXT,
    "passCriteria" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestProcedure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkProgramItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "testProcedureId" UUID NOT NULL,
    "assignedToId" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "result" TEXT,
    "findings" TEXT,
    "evidence" TEXT[],
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkProgramItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Issue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "rootCause" TEXT,
    "riskTheme" TEXT,
    "observationId" UUID,
    "controlId" UUID,
    "complianceItemId" UUID,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" UUID,
    "acceptedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "acceptanceReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Issue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionPlan" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "issueId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "milestone" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "assignedToId" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "evidence" TEXT[],
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "completionPct" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QaSelfAssessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "assessmentYear" INTEGER NOT NULL,
    "iiaStandard" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "response" TEXT,
    "evidence" TEXT,
    "gapIdentified" BOOLEAN NOT NULL DEFAULT false,
    "issueCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QaSelfAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConcurrentAuditTemplate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "scopeArea" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "checklistItems" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConcurrentAuditTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulatoryObservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "paraNo" TEXT,
    "description" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "atrStatus" TEXT NOT NULL DEFAULT 'DRAFT',
    "atrText" TEXT,
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "issueId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegulatoryObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "approvalDate" TIMESTAMP(3),
    "reviewDueDate" TIMESTAMP(3),
    "version" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "documentUrl" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Committee" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Committee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeMember" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "committeeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitteeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeMeeting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "committeeId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "agendaItems" JSONB,
    "minutesRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "attendees" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommitteeMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingMetric" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "metricType" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "openingBalance" DECIMAL(15,2) NOT NULL,
    "closingBalance" DECIMAL(15,2) NOT NULL,
    "entriesCount" INTEGER NOT NULL DEFAULT 0,
    "agingDays" INTEGER,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HousekeepingMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "securityType" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "isin" TEXT,
    "faceValue" DECIMAL(15,2) NOT NULL,
    "bookValue" DECIMAL(15,2) NOT NULL,
    "marketValue" DECIMAL(15,2),
    "brokerName" TEXT,
    "brokerShare" DECIMAL(5,4),
    "sglAccount" TEXT,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationInventory" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "appName" TEXT NOT NULL,
    "vendor" TEXT,
    "version" TEXT,
    "hostingType" TEXT NOT NULL,
    "criticality" TEXT NOT NULL,
    "drTested" BOOLEAN NOT NULL DEFAULT false,
    "lastDrTestDate" TIMESTAMP(3),
    "lastIsAuditDate" TIMESTAMP(3),
    "dataClassification" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorRiskAssessment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "applicationId" UUID,
    "vendorName" TEXT NOT NULL,
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "slaCompliance" DECIMAL(5,2),
    "riskRating" TEXT,
    "lastAssessmentDate" TIMESTAMP(3),
    "findings" TEXT,
    "mitigations" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VendorRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IsAuditChecklist" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "checklistName" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "engagementId" UUID,
    "completedById" UUID,
    "completedAt" TIMESTAMP(3),
    "overallRating" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IsAuditChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBranchAssignment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBranchAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditeeResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "observationId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "responseType" "ResponseType" NOT NULL,
    "content" TEXT NOT NULL,
    "submittedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditeeResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sequenceNumber" BIGSERIAL NOT NULL,
    "tenantId" UUID NOT NULL,
    "tableName" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "actionType" TEXT,
    "oldData" JSONB,
    "newData" JSONB,
    "userId" TEXT,
    "justification" TEXT,
    "ipAddress" TEXT,
    "sessionId" TEXT,
    "retentionExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationQueue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'PENDING',
    "batchKey" TEXT,
    "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "claimId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT,
    "subject" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "sesMessageId" TEXT,
    "status" TEXT NOT NULL,
    "notificationIds" TEXT[],
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "digestPreference" TEXT NOT NULL DEFAULT 'immediate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoardReport" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter" "Quarter" NOT NULL,
    "title" TEXT NOT NULL,
    "executiveCommentary" TEXT,
    "s3Key" TEXT,
    "fileSize" INTEGER,
    "generatedById" UUID NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricsSnapshot" JSONB,
    "hiaRecommendations" TEXT,
    "branchRatingDistribution" JSONB,
    "systemicFindings" JSONB,
    "complianceAging" JSONB,
    "trendData" JSONB,

    CONSTRAINT "BoardReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardSnapshot" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "DashboardSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RbiMasterDirection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shortId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "rbiRef" TEXT,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RbiMasterDirection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RbiChecklistItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "masterDirectionId" UUID NOT NULL,
    "itemCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tierApplicability" "UcbTier"[],
    "tierEnhancements" JSONB,
    "frequency" TEXT NOT NULL,
    "evidenceRequired" TEXT[],
    "priority" TEXT NOT NULL,
    "rbiCircularRef" TEXT,
    "rbiCircularUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RbiChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "completedSteps" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "stepData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'in_progress',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExaminationNode" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "isLeaf" BOOLEAN NOT NULL DEFAULT false,
    "parentId" UUID,
    "weight" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "riskCategory" TEXT,
    "regulatoryRef" TEXT,
    "applicableBranchTypes" TEXT[],
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExaminationNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExaminationResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "nodeId" UUID NOT NULL,
    "score" DECIMAL(4,2),
    "scoreLabel" "ScoreLabel",
    "isNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "notApplicableReason" TEXT,
    "workingNotes" TEXT,
    "flagForObservation" BOOLEAN NOT NULL DEFAULT false,
    "flagForActionPoint" BOOLEAN NOT NULL DEFAULT false,
    "respondedById" UUID,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExaminationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchRbiaScore" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "compositeScore" DECIMAL(5,2) NOT NULL,
    "ratingBand" TEXT NOT NULL,
    "moduleScores" JSONB NOT NULL,
    "scoringTreeSnapshot" JSONB NOT NULL,
    "frozenAt" TIMESTAMP(3),
    "frozenById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchRbiaScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementModuleSelection" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "moduleNodeId" UUID NOT NULL,
    "isAutoSelected" BOOLEAN NOT NULL DEFAULT false,
    "selectionReason" TEXT,
    "removalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementModuleSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementSectionNa" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "markedById" UUID NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementSectionNa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementMeeting" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "meetingType" "MeetingType" NOT NULL,
    "meetingDate" TIMESTAMP(3) NOT NULL,
    "attendees" JSONB NOT NULL,
    "minutesText" TEXT,
    "keyDiscussionPoints" TEXT,
    "signedOff" BOOLEAN NOT NULL DEFAULT false,
    "signedOffById" UUID,
    "signedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionPoint" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "serialNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "sourceResponseId" UUID,
    "status" "ActionPointStatus" NOT NULL DEFAULT 'DRAFT',
    "bmResponseText" TEXT,
    "bmResponseDate" TIMESTAMP(3),
    "bmResponseDeadline" TIMESTAMP(3),
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "closedById" UUID,
    "closedAt" TIMESTAMP(3),
    "carriedForwardToEngagementId" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BmResponseBatch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "totalActionPoints" INTEGER NOT NULL,
    "respondedActionPoints" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" "BmBatchStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BmResponseBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PositiveObservation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PositiveObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExaminationQuestion" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "rbiReference" TEXT,
    "bestPracticeTip" TEXT,
    "category" TEXT,
    "weight" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExaminationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanAccount" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "accountNo" TEXT NOT NULL,
    "borrowerName" TEXT NOT NULL,
    "productType" TEXT NOT NULL,
    "sanctionAmount" DECIMAL(15,2) NOT NULL,
    "sanctionDate" TIMESTAMP(3) NOT NULL,
    "outstandingAmount" DECIMAL(15,2) NOT NULL,
    "assetClass" TEXT NOT NULL,
    "dpd" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "isSampled" BOOLEAN NOT NULL DEFAULT false,
    "sampledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoanAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SamplingConfig" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "moduleCode" TEXT NOT NULL,
    "sampleSizePct" DECIMAL(5,2) NOT NULL,
    "criteriaBuckets" JSONB NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedById" UUID,
    "sampleGenerated" BOOLEAN NOT NULL DEFAULT false,
    "sampleGeneratedAt" TIMESTAMP(3),
    "sampleCount" INTEGER,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SamplingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountExamResponse" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "loanAccountId" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "status" "AccountExamResponseStatus",
    "note" TEXT,
    "isNotApplicable" BOOLEAN NOT NULL DEFAULT false,
    "respondedById" UUID NOT NULL,
    "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountExamResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FailedLoginAttempt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),

    CONSTRAINT "FailedLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_rbiLicenseNo_key" ON "Tenant"("rbiLicenseNo");

-- CreateIndex
CREATE UNIQUE INDEX "User_inviteTokenHash_key" ON "User"("inviteTokenHash");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_token_idx" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_accountId_providerId_key" ON "Account"("accountId", "providerId");

-- CreateIndex
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- CreateIndex
CREATE INDEX "Observation_tenantId_idx" ON "Observation"("tenantId");

-- CreateIndex
CREATE INDEX "Observation_severity_idx" ON "Observation"("severity");

-- CreateIndex
CREATE INDEX "Observation_status_idx" ON "Observation"("status");

-- CreateIndex
CREATE INDEX "Observation_tenantId_branchId_auditAreaId_status_idx" ON "Observation"("tenantId", "branchId", "auditAreaId", "status");

-- CreateIndex
CREATE INDEX "Observation_engagementId_idx" ON "Observation"("engagementId");

-- CreateIndex
CREATE INDEX "Observation_repeatOfId_idx" ON "Observation"("repeatOfId");

-- CreateIndex
CREATE INDEX "ObservationTimeline_tenantId_idx" ON "ObservationTimeline"("tenantId");

-- CreateIndex
CREATE INDEX "ObservationTimeline_observationId_idx" ON "ObservationTimeline"("observationId");

-- CreateIndex
CREATE INDEX "ObservationRbiCircular_observationId_idx" ON "ObservationRbiCircular"("observationId");

-- CreateIndex
CREATE INDEX "ObservationRbiCircular_rbiCircularId_idx" ON "ObservationRbiCircular"("rbiCircularId");

-- CreateIndex
CREATE UNIQUE INDEX "ObservationRbiCircular_observationId_rbiCircularId_key" ON "ObservationRbiCircular"("observationId", "rbiCircularId");

-- CreateIndex
CREATE INDEX "Evidence_tenantId_idx" ON "Evidence"("tenantId");

-- CreateIndex
CREATE INDEX "Evidence_observationId_idx" ON "Evidence"("observationId");

-- CreateIndex
CREATE INDEX "Evidence_examinationResponseId_idx" ON "Evidence"("examinationResponseId");

-- CreateIndex
CREATE INDEX "Evidence_newExaminationResponseId_idx" ON "Evidence"("newExaminationResponseId");

-- CreateIndex
CREATE INDEX "Evidence_actionPointId_idx" ON "Evidence"("actionPointId");

-- CreateIndex
CREATE INDEX "Evidence_accountExamResponseId_idx" ON "Evidence"("accountExamResponseId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadIntent_s3Key_key" ON "UploadIntent"("s3Key");

-- CreateIndex
CREATE INDEX "UploadIntent_tenantId_idx" ON "UploadIntent"("tenantId");

-- CreateIndex
CREATE INDEX "UploadIntent_expiresAt_idx" ON "UploadIntent"("expiresAt");

-- CreateIndex
CREATE INDEX "ComplianceRequirement_tenantId_idx" ON "ComplianceRequirement"("tenantId");

-- CreateIndex
CREATE INDEX "ComplianceRequirement_status_idx" ON "ComplianceRequirement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "RbiCircular_circularNumber_key" ON "RbiCircular"("circularNumber");

-- CreateIndex
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_code_key" ON "Branch"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_tenantId_id_key" ON "Branch"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Zone_tenantId_idx" ON "Zone"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_tenantId_code_key" ON "Zone"("tenantId", "code");

-- CreateIndex
CREATE INDEX "AuditArea_tenantId_idx" ON "AuditArea"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditArea_tenantId_name_key" ON "AuditArea"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AuditArea_tenantId_id_key" ON "AuditArea"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AuditPlan_tenantId_idx" ON "AuditPlan"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlan_tenantId_year_quarter_key" ON "AuditPlan"("tenantId", "year", "quarter");

-- CreateIndex
CREATE UNIQUE INDEX "AuditPlan_tenantId_id_key" ON "AuditPlan"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AuditEngagement_tenantId_idx" ON "AuditEngagement"("tenantId");

-- CreateIndex
CREATE INDEX "AuditEngagement_auditPlanId_idx" ON "AuditEngagement"("auditPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditEngagement_tenantId_id_key" ON "AuditEngagement"("tenantId", "id");

-- CreateIndex
CREATE INDEX "AuditTeamMember_tenantId_idx" ON "AuditTeamMember"("tenantId");

-- CreateIndex
CREATE INDEX "AuditTeamMember_engagementId_idx" ON "AuditTeamMember"("engagementId");

-- CreateIndex
CREATE INDEX "AuditTeamMember_userId_idx" ON "AuditTeamMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditTeamMember_engagementId_userId_key" ON "AuditTeamMember"("engagementId", "userId");

-- CreateIndex
CREATE INDEX "RamParameterConfig_tenantId_idx" ON "RamParameterConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RamParameterConfig_tenantId_code_key" ON "RamParameterConfig"("tenantId", "code");

-- CreateIndex
CREATE INDEX "RamAssessment_tenantId_idx" ON "RamAssessment"("tenantId");

-- CreateIndex
CREATE INDEX "RamAssessment_branchId_idx" ON "RamAssessment"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "RamAssessment_tenantId_branchId_assessmentYear_key" ON "RamAssessment"("tenantId", "branchId", "assessmentYear");

-- CreateIndex
CREATE INDEX "RamAssessmentScore_assessmentId_idx" ON "RamAssessmentScore"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "RamAssessmentScore_assessmentId_paramConfigId_key" ON "RamAssessmentScore"("assessmentId", "paramConfigId");

-- CreateIndex
CREATE INDEX "ExaminationArea_tenantId_idx" ON "ExaminationArea"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ExaminationArea_tenantId_code_key" ON "ExaminationArea"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ExaminationItem_tenantId_idx" ON "ExaminationItem"("tenantId");

-- CreateIndex
CREATE INDEX "ExaminationItem_areaId_idx" ON "ExaminationItem"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "ExaminationItem_tenantId_areaId_itemNumber_key" ON "ExaminationItem"("tenantId", "areaId", "itemNumber");

-- CreateIndex
CREATE INDEX "AuditExaminationResponse_tenantId_idx" ON "AuditExaminationResponse"("tenantId");

-- CreateIndex
CREATE INDEX "AuditExaminationResponse_engagementId_idx" ON "AuditExaminationResponse"("engagementId");

-- CreateIndex
CREATE INDEX "AuditExaminationResponse_observationId_idx" ON "AuditExaminationResponse"("observationId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditExaminationResponse_engagementId_itemId_key" ON "AuditExaminationResponse"("engagementId", "itemId");

-- CreateIndex
CREATE INDEX "AuditSectionInstance_tenantId_idx" ON "AuditSectionInstance"("tenantId");

-- CreateIndex
CREATE INDEX "AuditSectionInstance_engagementId_idx" ON "AuditSectionInstance"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditSectionInstance_engagementId_sectionCode_key" ON "AuditSectionInstance"("engagementId", "sectionCode");

-- CreateIndex
CREATE INDEX "CashCheck_tenantId_idx" ON "CashCheck"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CashCheck_engagementId_key" ON "CashCheck"("engagementId");

-- CreateIndex
CREATE INDEX "LoanReview_tenantId_idx" ON "LoanReview"("tenantId");

-- CreateIndex
CREATE INDEX "LoanReview_engagementId_idx" ON "LoanReview"("engagementId");

-- CreateIndex
CREATE INDEX "LoanReview_engagementId_assetClass_idx" ON "LoanReview"("engagementId", "assetClass");

-- CreateIndex
CREATE INDEX "SmaNpaEntry_tenantId_idx" ON "SmaNpaEntry"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SmaNpaEntry_engagementId_category_key" ON "SmaNpaEntry"("engagementId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceItem_observationId_key" ON "ComplianceItem"("observationId");

-- CreateIndex
CREATE INDEX "ComplianceItem_tenantId_idx" ON "ComplianceItem"("tenantId");

-- CreateIndex
CREATE INDEX "ComplianceItem_status_idx" ON "ComplianceItem"("status");

-- CreateIndex
CREATE INDEX "ComplianceItem_branchId_status_idx" ON "ComplianceItem"("branchId", "status");

-- CreateIndex
CREATE INDEX "ComplianceItem_dueDate_idx" ON "ComplianceItem"("dueDate");

-- CreateIndex
CREATE INDEX "ComplianceItem_escalationLevel_idx" ON "ComplianceItem"("escalationLevel");

-- CreateIndex
CREATE INDEX "ReportTemplate_tenantId_idx" ON "ReportTemplate"("tenantId");

-- CreateIndex
CREATE INDEX "ReportTemplate_tenantId_category_isActive_idx" ON "ReportTemplate"("tenantId", "category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_tenantId_name_versionNumber_key" ON "ReportTemplate"("tenantId", "name", "versionNumber");

-- CreateIndex
CREATE INDEX "AuditCalendar_tenantId_idx" ON "AuditCalendar"("tenantId");

-- CreateIndex
CREATE INDEX "AuditCalendar_tenantId_startDate_idx" ON "AuditCalendar"("tenantId", "startDate");

-- CreateIndex
CREATE INDEX "AuditCalendar_eventType_idx" ON "AuditCalendar"("eventType");

-- CreateIndex
CREATE INDEX "AuditUniverseEntity_tenantId_idx" ON "AuditUniverseEntity"("tenantId");

-- CreateIndex
CREATE INDEX "AuditUniverseEntity_entityType_idx" ON "AuditUniverseEntity"("entityType");

-- CreateIndex
CREATE UNIQUE INDEX "AuditUniverseEntity_tenantId_entityType_name_key" ON "AuditUniverseEntity"("tenantId", "entityType", "name");

-- CreateIndex
CREATE INDEX "RiskRegister_tenantId_idx" ON "RiskRegister"("tenantId");

-- CreateIndex
CREATE INDEX "RiskRegister_entityId_idx" ON "RiskRegister"("entityId");

-- CreateIndex
CREATE INDEX "RiskRegister_riskCategory_idx" ON "RiskRegister"("riskCategory");

-- CreateIndex
CREATE INDEX "KeyRiskIndicator_tenantId_idx" ON "KeyRiskIndicator"("tenantId");

-- CreateIndex
CREATE INDEX "KeyRiskIndicator_riskRegisterId_idx" ON "KeyRiskIndicator"("riskRegisterId");

-- CreateIndex
CREATE INDEX "KeyRiskIndicator_breachStatus_idx" ON "KeyRiskIndicator"("breachStatus");

-- CreateIndex
CREATE INDEX "RiskAuditLinkage_tenantId_idx" ON "RiskAuditLinkage"("tenantId");

-- CreateIndex
CREATE INDEX "RiskAuditLinkage_thematicArea_idx" ON "RiskAuditLinkage"("thematicArea");

-- CreateIndex
CREATE UNIQUE INDEX "RiskAuditLinkage_riskRegisterId_engagementId_key" ON "RiskAuditLinkage"("riskRegisterId", "engagementId");

-- CreateIndex
CREATE INDEX "ControlLibrary_tenantId_idx" ON "ControlLibrary"("tenantId");

-- CreateIndex
CREATE INDEX "ControlLibrary_processArea_idx" ON "ControlLibrary"("processArea");

-- CreateIndex
CREATE INDEX "ControlLibrary_isKeyControl_idx" ON "ControlLibrary"("isKeyControl");

-- CreateIndex
CREATE UNIQUE INDEX "ControlLibrary_tenantId_controlCode_key" ON "ControlLibrary"("tenantId", "controlCode");

-- CreateIndex
CREATE INDEX "TestProcedure_tenantId_idx" ON "TestProcedure"("tenantId");

-- CreateIndex
CREATE INDEX "TestProcedure_controlId_idx" ON "TestProcedure"("controlId");

-- CreateIndex
CREATE INDEX "WorkProgramItem_tenantId_idx" ON "WorkProgramItem"("tenantId");

-- CreateIndex
CREATE INDEX "WorkProgramItem_engagementId_idx" ON "WorkProgramItem"("engagementId");

-- CreateIndex
CREATE INDEX "WorkProgramItem_status_idx" ON "WorkProgramItem"("status");

-- CreateIndex
CREATE INDEX "Issue_tenantId_idx" ON "Issue"("tenantId");

-- CreateIndex
CREATE INDEX "Issue_source_idx" ON "Issue"("source");

-- CreateIndex
CREATE INDEX "Issue_severity_idx" ON "Issue"("severity");

-- CreateIndex
CREATE INDEX "Issue_status_idx" ON "Issue"("status");

-- CreateIndex
CREATE INDEX "ActionPlan_tenantId_idx" ON "ActionPlan"("tenantId");

-- CreateIndex
CREATE INDEX "ActionPlan_issueId_idx" ON "ActionPlan"("issueId");

-- CreateIndex
CREATE INDEX "ActionPlan_status_idx" ON "ActionPlan"("status");

-- CreateIndex
CREATE INDEX "ActionPlan_dueDate_idx" ON "ActionPlan"("dueDate");

-- CreateIndex
CREATE INDEX "QaSelfAssessment_tenantId_idx" ON "QaSelfAssessment"("tenantId");

-- CreateIndex
CREATE INDEX "QaSelfAssessment_assessmentYear_idx" ON "QaSelfAssessment"("assessmentYear");

-- CreateIndex
CREATE INDEX "QaSelfAssessment_gapIdentified_idx" ON "QaSelfAssessment"("gapIdentified");

-- CreateIndex
CREATE INDEX "ConcurrentAuditTemplate_tenantId_idx" ON "ConcurrentAuditTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ConcurrentAuditTemplate_tenantId_scopeArea_name_key" ON "ConcurrentAuditTemplate"("tenantId", "scopeArea", "name");

-- CreateIndex
CREATE INDEX "RegulatoryObservation_tenantId_idx" ON "RegulatoryObservation"("tenantId");

-- CreateIndex
CREATE INDEX "RegulatoryObservation_atrStatus_idx" ON "RegulatoryObservation"("atrStatus");

-- CreateIndex
CREATE INDEX "RegulatoryObservation_source_idx" ON "RegulatoryObservation"("source");

-- CreateIndex
CREATE UNIQUE INDEX "RegulatoryObservation_tenantId_referenceNo_key" ON "RegulatoryObservation"("tenantId", "referenceNo");

-- CreateIndex
CREATE INDEX "PolicyDocument_tenantId_idx" ON "PolicyDocument"("tenantId");

-- CreateIndex
CREATE INDEX "PolicyDocument_category_idx" ON "PolicyDocument"("category");

-- CreateIndex
CREATE INDEX "PolicyDocument_reviewDueDate_idx" ON "PolicyDocument"("reviewDueDate");

-- CreateIndex
CREATE INDEX "Committee_tenantId_idx" ON "Committee"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Committee_tenantId_name_key" ON "Committee"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CommitteeMember_committeeId_userId_key" ON "CommitteeMember"("committeeId", "userId");

-- CreateIndex
CREATE INDEX "CommitteeMeeting_committeeId_idx" ON "CommitteeMeeting"("committeeId");

-- CreateIndex
CREATE INDEX "CommitteeMeeting_tenantId_idx" ON "CommitteeMeeting"("tenantId");

-- CreateIndex
CREATE INDEX "CommitteeMeeting_meetingDate_idx" ON "CommitteeMeeting"("meetingDate");

-- CreateIndex
CREATE INDEX "HousekeepingMetric_tenantId_idx" ON "HousekeepingMetric"("tenantId");

-- CreateIndex
CREATE INDEX "HousekeepingMetric_branchId_idx" ON "HousekeepingMetric"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "HousekeepingMetric_tenantId_branchId_metricType_period_key" ON "HousekeepingMetric"("tenantId", "branchId", "metricType", "period");

-- CreateIndex
CREATE INDEX "InvestmentRecord_tenantId_idx" ON "InvestmentRecord"("tenantId");

-- CreateIndex
CREATE INDEX "InvestmentRecord_securityType_idx" ON "InvestmentRecord"("securityType");

-- CreateIndex
CREATE INDEX "InvestmentRecord_classification_idx" ON "InvestmentRecord"("classification");

-- CreateIndex
CREATE INDEX "InvestmentRecord_brokerName_idx" ON "InvestmentRecord"("brokerName");

-- CreateIndex
CREATE INDEX "ApplicationInventory_tenantId_idx" ON "ApplicationInventory"("tenantId");

-- CreateIndex
CREATE INDEX "ApplicationInventory_criticality_idx" ON "ApplicationInventory"("criticality");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationInventory_tenantId_appName_key" ON "ApplicationInventory"("tenantId", "appName");

-- CreateIndex
CREATE INDEX "VendorRiskAssessment_tenantId_idx" ON "VendorRiskAssessment"("tenantId");

-- CreateIndex
CREATE INDEX "VendorRiskAssessment_vendorName_idx" ON "VendorRiskAssessment"("vendorName");

-- CreateIndex
CREATE INDEX "IsAuditChecklist_tenantId_idx" ON "IsAuditChecklist"("tenantId");

-- CreateIndex
CREATE INDEX "IsAuditChecklist_category_idx" ON "IsAuditChecklist"("category");

-- CreateIndex
CREATE INDEX "IsAuditChecklist_engagementId_idx" ON "IsAuditChecklist"("engagementId");

-- CreateIndex
CREATE INDEX "UserBranchAssignment_tenantId_idx" ON "UserBranchAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "UserBranchAssignment_userId_idx" ON "UserBranchAssignment"("userId");

-- CreateIndex
CREATE INDEX "UserBranchAssignment_branchId_idx" ON "UserBranchAssignment"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBranchAssignment_userId_branchId_key" ON "UserBranchAssignment"("userId", "branchId");

-- CreateIndex
CREATE INDEX "AuditeeResponse_tenantId_idx" ON "AuditeeResponse"("tenantId");

-- CreateIndex
CREATE INDEX "AuditeeResponse_observationId_idx" ON "AuditeeResponse"("observationId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_tableName_recordId_idx" ON "AuditLog"("tableName", "recordId");

-- CreateIndex
CREATE INDEX "AuditLog_actionType_idx" ON "AuditLog"("actionType");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationQueue_tenantId_idx" ON "NotificationQueue"("tenantId");

-- CreateIndex
CREATE INDEX "NotificationQueue_status_sendAfter_idx" ON "NotificationQueue"("status", "sendAfter");

-- CreateIndex
CREATE INDEX "NotificationQueue_batchKey_status_idx" ON "NotificationQueue"("batchKey", "status");

-- CreateIndex
CREATE INDEX "NotificationQueue_claimId_idx" ON "NotificationQueue"("claimId");

-- CreateIndex
CREATE INDEX "EmailLog_tenantId_idx" ON "EmailLog"("tenantId");

-- CreateIndex
CREATE INDEX "EmailLog_recipientEmail_idx" ON "EmailLog"("recipientEmail");

-- CreateIndex
CREATE INDEX "EmailLog_sentAt_idx" ON "EmailLog"("sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "NotificationPreference_tenantId_idx" ON "NotificationPreference"("tenantId");

-- CreateIndex
CREATE INDEX "BoardReport_tenantId_idx" ON "BoardReport"("tenantId");

-- CreateIndex
CREATE INDEX "BoardReport_tenantId_year_quarter_idx" ON "BoardReport"("tenantId", "year", "quarter");

-- CreateIndex
CREATE INDEX "DashboardSnapshot_tenantId_capturedAt_idx" ON "DashboardSnapshot"("tenantId", "capturedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RbiMasterDirection_shortId_key" ON "RbiMasterDirection"("shortId");

-- CreateIndex
CREATE UNIQUE INDEX "RbiChecklistItem_itemCode_key" ON "RbiChecklistItem"("itemCode");

-- CreateIndex
CREATE INDEX "RbiChecklistItem_masterDirectionId_idx" ON "RbiChecklistItem"("masterDirectionId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_tenantId_key" ON "OnboardingProgress"("tenantId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_tenantId_idx" ON "OnboardingProgress"("tenantId");

-- CreateIndex
CREATE INDEX "ExaminationNode_tenantId_idx" ON "ExaminationNode"("tenantId");

-- CreateIndex
CREATE INDEX "ExaminationNode_tenantId_path_idx" ON "ExaminationNode"("tenantId", "path");

-- CreateIndex
CREATE INDEX "ExaminationNode_parentId_idx" ON "ExaminationNode"("parentId");

-- CreateIndex
CREATE INDEX "ExaminationNode_tenantId_depth_isActive_idx" ON "ExaminationNode"("tenantId", "depth", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ExaminationNode_tenantId_code_key" ON "ExaminationNode"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ExaminationResponse_tenantId_idx" ON "ExaminationResponse"("tenantId");

-- CreateIndex
CREATE INDEX "ExaminationResponse_engagementId_idx" ON "ExaminationResponse"("engagementId");

-- CreateIndex
CREATE INDEX "ExaminationResponse_engagementId_flagForObservation_idx" ON "ExaminationResponse"("engagementId", "flagForObservation");

-- CreateIndex
CREATE INDEX "ExaminationResponse_engagementId_flagForActionPoint_idx" ON "ExaminationResponse"("engagementId", "flagForActionPoint");

-- CreateIndex
CREATE UNIQUE INDEX "ExaminationResponse_engagementId_nodeId_key" ON "ExaminationResponse"("engagementId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchRbiaScore_engagementId_key" ON "BranchRbiaScore"("engagementId");

-- CreateIndex
CREATE INDEX "BranchRbiaScore_tenantId_idx" ON "BranchRbiaScore"("tenantId");

-- CreateIndex
CREATE INDEX "BranchRbiaScore_branchId_idx" ON "BranchRbiaScore"("branchId");

-- CreateIndex
CREATE INDEX "BranchRbiaScore_branchId_frozenAt_idx" ON "BranchRbiaScore"("branchId", "frozenAt");

-- CreateIndex
CREATE INDEX "EngagementModuleSelection_tenantId_idx" ON "EngagementModuleSelection"("tenantId");

-- CreateIndex
CREATE INDEX "EngagementModuleSelection_engagementId_idx" ON "EngagementModuleSelection"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementModuleSelection_engagementId_moduleNodeId_key" ON "EngagementModuleSelection"("engagementId", "moduleNodeId");

-- CreateIndex
CREATE INDEX "EngagementSectionNa_tenantId_idx" ON "EngagementSectionNa"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementSectionNa_engagementId_moduleId_key" ON "EngagementSectionNa"("engagementId", "moduleId");

-- CreateIndex
CREATE INDEX "EngagementMeeting_tenantId_idx" ON "EngagementMeeting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementMeeting_engagementId_meetingType_key" ON "EngagementMeeting"("engagementId", "meetingType");

-- CreateIndex
CREATE INDEX "ActionPoint_tenantId_idx" ON "ActionPoint"("tenantId");

-- CreateIndex
CREATE INDEX "ActionPoint_engagementId_idx" ON "ActionPoint"("engagementId");

-- CreateIndex
CREATE INDEX "ActionPoint_engagementId_status_idx" ON "ActionPoint"("engagementId", "status");

-- CreateIndex
CREATE INDEX "ActionPoint_branchId_status_idx" ON "ActionPoint"("branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BmResponseBatch_engagementId_key" ON "BmResponseBatch"("engagementId");

-- CreateIndex
CREATE INDEX "BmResponseBatch_tenantId_idx" ON "BmResponseBatch"("tenantId");

-- CreateIndex
CREATE INDEX "BmResponseBatch_status_deadline_idx" ON "BmResponseBatch"("status", "deadline");

-- CreateIndex
CREATE INDEX "PositiveObservation_tenantId_idx" ON "PositiveObservation"("tenantId");

-- CreateIndex
CREATE INDEX "PositiveObservation_engagementId_idx" ON "PositiveObservation"("engagementId");

-- CreateIndex
CREATE INDEX "ExaminationQuestion_tenantId_idx" ON "ExaminationQuestion"("tenantId");

-- CreateIndex
CREATE INDEX "ExaminationQuestion_tenantId_moduleCode_isActive_idx" ON "ExaminationQuestion"("tenantId", "moduleCode", "isActive");

-- CreateIndex
CREATE INDEX "ExaminationQuestion_tenantId_moduleCode_displayOrder_idx" ON "ExaminationQuestion"("tenantId", "moduleCode", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExaminationQuestion_tenantId_moduleCode_text_key" ON "ExaminationQuestion"("tenantId", "moduleCode", "text");

-- CreateIndex
CREATE INDEX "LoanAccount_tenantId_idx" ON "LoanAccount"("tenantId");

-- CreateIndex
CREATE INDEX "LoanAccount_engagementId_idx" ON "LoanAccount"("engagementId");

-- CreateIndex
CREATE INDEX "LoanAccount_engagementId_moduleCode_idx" ON "LoanAccount"("engagementId", "moduleCode");

-- CreateIndex
CREATE INDEX "LoanAccount_engagementId_isSampled_idx" ON "LoanAccount"("engagementId", "isSampled");

-- CreateIndex
CREATE INDEX "LoanAccount_engagementId_assetClass_idx" ON "LoanAccount"("engagementId", "assetClass");

-- CreateIndex
CREATE INDEX "LoanAccount_engagementId_dpd_idx" ON "LoanAccount"("engagementId", "dpd");

-- CreateIndex
CREATE UNIQUE INDEX "LoanAccount_engagementId_accountNo_key" ON "LoanAccount"("engagementId", "accountNo");

-- CreateIndex
CREATE INDEX "SamplingConfig_tenantId_idx" ON "SamplingConfig"("tenantId");

-- CreateIndex
CREATE INDEX "SamplingConfig_engagementId_idx" ON "SamplingConfig"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "SamplingConfig_engagementId_moduleCode_key" ON "SamplingConfig"("engagementId", "moduleCode");

-- CreateIndex
CREATE INDEX "AccountExamResponse_tenantId_idx" ON "AccountExamResponse"("tenantId");

-- CreateIndex
CREATE INDEX "AccountExamResponse_engagementId_idx" ON "AccountExamResponse"("engagementId");

-- CreateIndex
CREATE INDEX "AccountExamResponse_engagementId_questionId_idx" ON "AccountExamResponse"("engagementId", "questionId");

-- CreateIndex
CREATE INDEX "AccountExamResponse_loanAccountId_idx" ON "AccountExamResponse"("loanAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountExamResponse_engagementId_loanAccountId_questionId_key" ON "AccountExamResponse"("engagementId", "loanAccountId", "questionId");

-- CreateIndex
CREATE INDEX "FailedLoginAttempt_email_attemptedAt_idx" ON "FailedLoginAttempt"("email", "attemptedAt");

-- CreateIndex
CREATE INDEX "FailedLoginAttempt_email_lockedUntil_idx" ON "FailedLoginAttempt"("email", "lockedUntil");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_auditAreaId_fkey" FOREIGN KEY ("auditAreaId") REFERENCES "AuditArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_repeatOfId_fkey" FOREIGN KEY ("repeatOfId") REFERENCES "Observation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationTimeline" ADD CONSTRAINT "ObservationTimeline_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationTimeline" ADD CONSTRAINT "ObservationTimeline_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationTimeline" ADD CONSTRAINT "ObservationTimeline_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationRbiCircular" ADD CONSTRAINT "ObservationRbiCircular_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationRbiCircular" ADD CONSTRAINT "ObservationRbiCircular_rbiCircularId_fkey" FOREIGN KEY ("rbiCircularId") REFERENCES "RbiCircular"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_examinationResponseId_fkey" FOREIGN KEY ("examinationResponseId") REFERENCES "AuditExaminationResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_newExaminationResponseId_fkey" FOREIGN KEY ("newExaminationResponseId") REFERENCES "ExaminationResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_actionPointId_fkey" FOREIGN KEY ("actionPointId") REFERENCES "ActionPoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_accountExamResponseId_fkey" FOREIGN KEY ("accountExamResponseId") REFERENCES "AccountExamResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadIntent" ADD CONSTRAINT "UploadIntent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_rbiCircularId_fkey" FOREIGN KEY ("rbiCircularId") REFERENCES "RbiCircular"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceRequirement" ADD CONSTRAINT "ComplianceRequirement_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zone" ADD CONSTRAINT "Zone_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditArea" ADD CONSTRAINT "AuditArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditPlan" ADD CONSTRAINT "AuditPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEngagement" ADD CONSTRAINT "AuditEngagement_auditPlanId_fkey" FOREIGN KEY ("auditPlanId") REFERENCES "AuditPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEngagement" ADD CONSTRAINT "AuditEngagement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEngagement" ADD CONSTRAINT "AuditEngagement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEngagement" ADD CONSTRAINT "AuditEngagement_auditAreaId_fkey" FOREIGN KEY ("auditAreaId") REFERENCES "AuditArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTeamMember" ADD CONSTRAINT "AuditTeamMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTeamMember" ADD CONSTRAINT "AuditTeamMember_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditTeamMember" ADD CONSTRAINT "AuditTeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RamParameterConfig" ADD CONSTRAINT "RamParameterConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RamAssessment" ADD CONSTRAINT "RamAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RamAssessment" ADD CONSTRAINT "RamAssessment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RamAssessmentScore" ADD CONSTRAINT "RamAssessmentScore_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "RamAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RamAssessmentScore" ADD CONSTRAINT "RamAssessmentScore_paramConfigId_fkey" FOREIGN KEY ("paramConfigId") REFERENCES "RamParameterConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationArea" ADD CONSTRAINT "ExaminationArea_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationItem" ADD CONSTRAINT "ExaminationItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationItem" ADD CONSTRAINT "ExaminationItem_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "ExaminationArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExaminationResponse" ADD CONSTRAINT "AuditExaminationResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExaminationResponse" ADD CONSTRAINT "AuditExaminationResponse_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExaminationResponse" ADD CONSTRAINT "AuditExaminationResponse_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ExaminationItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditExaminationResponse" ADD CONSTRAINT "AuditExaminationResponse_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditSectionInstance" ADD CONSTRAINT "AuditSectionInstance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditSectionInstance" ADD CONSTRAINT "AuditSectionInstance_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCheck" ADD CONSTRAINT "CashCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashCheck" ADD CONSTRAINT "CashCheck_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanReview" ADD CONSTRAINT "LoanReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanReview" ADD CONSTRAINT "LoanReview_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmaNpaEntry" ADD CONSTRAINT "SmaNpaEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmaNpaEntry" ADD CONSTRAINT "SmaNpaEntry_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AuditEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCalendar" ADD CONSTRAINT "AuditCalendar_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCalendar" ADD CONSTRAINT "AuditCalendar_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditCalendar" ADD CONSTRAINT "AuditCalendar_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditUniverseEntity" ADD CONSTRAINT "AuditUniverseEntity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditUniverseEntity" ADD CONSTRAINT "AuditUniverseEntity_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRegister" ADD CONSTRAINT "RiskRegister_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskRegister" ADD CONSTRAINT "RiskRegister_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "AuditUniverseEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyRiskIndicator" ADD CONSTRAINT "KeyRiskIndicator_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KeyRiskIndicator" ADD CONSTRAINT "KeyRiskIndicator_riskRegisterId_fkey" FOREIGN KEY ("riskRegisterId") REFERENCES "RiskRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAuditLinkage" ADD CONSTRAINT "RiskAuditLinkage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAuditLinkage" ADD CONSTRAINT "RiskAuditLinkage_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "AuditUniverseEntity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAuditLinkage" ADD CONSTRAINT "RiskAuditLinkage_riskRegisterId_fkey" FOREIGN KEY ("riskRegisterId") REFERENCES "RiskRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAuditLinkage" ADD CONSTRAINT "RiskAuditLinkage_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlLibrary" ADD CONSTRAINT "ControlLibrary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlLibrary" ADD CONSTRAINT "ControlLibrary_riskRegisterId_fkey" FOREIGN KEY ("riskRegisterId") REFERENCES "RiskRegister"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestProcedure" ADD CONSTRAINT "TestProcedure_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestProcedure" ADD CONSTRAINT "TestProcedure_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlLibrary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgramItem" ADD CONSTRAINT "WorkProgramItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgramItem" ADD CONSTRAINT "WorkProgramItem_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkProgramItem" ADD CONSTRAINT "WorkProgramItem_testProcedureId_fkey" FOREIGN KEY ("testProcedureId") REFERENCES "TestProcedure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Issue" ADD CONSTRAINT "Issue_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ControlLibrary"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlan" ADD CONSTRAINT "ActionPlan_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QaSelfAssessment" ADD CONSTRAINT "QaSelfAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcurrentAuditTemplate" ADD CONSTRAINT "ConcurrentAuditTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryObservation" ADD CONSTRAINT "RegulatoryObservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulatoryObservation" ADD CONSTRAINT "RegulatoryObservation_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "Issue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Committee" ADD CONSTRAINT "Committee_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMember" ADD CONSTRAINT "CommitteeMember_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMember" ADD CONSTRAINT "CommitteeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMeeting" ADD CONSTRAINT "CommitteeMeeting_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeMeeting" ADD CONSTRAINT "CommitteeMeeting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingMetric" ADD CONSTRAINT "HousekeepingMetric_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingMetric" ADD CONSTRAINT "HousekeepingMetric_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentRecord" ADD CONSTRAINT "InvestmentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationInventory" ADD CONSTRAINT "ApplicationInventory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRiskAssessment" ADD CONSTRAINT "VendorRiskAssessment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorRiskAssessment" ADD CONSTRAINT "VendorRiskAssessment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ApplicationInventory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsAuditChecklist" ADD CONSTRAINT "IsAuditChecklist_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IsAuditChecklist" ADD CONSTRAINT "IsAuditChecklist_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAssignment" ADD CONSTRAINT "UserBranchAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAssignment" ADD CONSTRAINT "UserBranchAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBranchAssignment" ADD CONSTRAINT "UserBranchAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditeeResponse" ADD CONSTRAINT "AuditeeResponse_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditeeResponse" ADD CONSTRAINT "AuditeeResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditeeResponse" ADD CONSTRAINT "AuditeeResponse_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationQueue" ADD CONSTRAINT "NotificationQueue_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardReport" ADD CONSTRAINT "BoardReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardReport" ADD CONSTRAINT "BoardReport_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardSnapshot" ADD CONSTRAINT "DashboardSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RbiChecklistItem" ADD CONSTRAINT "RbiChecklistItem_masterDirectionId_fkey" FOREIGN KEY ("masterDirectionId") REFERENCES "RbiMasterDirection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationNode" ADD CONSTRAINT "ExaminationNode_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationNode" ADD CONSTRAINT "ExaminationNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ExaminationNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationResponse" ADD CONSTRAINT "ExaminationResponse_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationResponse" ADD CONSTRAINT "ExaminationResponse_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ExaminationNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchRbiaScore" ADD CONSTRAINT "BranchRbiaScore_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementModuleSelection" ADD CONSTRAINT "EngagementModuleSelection_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementModuleSelection" ADD CONSTRAINT "EngagementModuleSelection_moduleNodeId_fkey" FOREIGN KEY ("moduleNodeId") REFERENCES "ExaminationNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSectionNa" ADD CONSTRAINT "EngagementSectionNa_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSectionNa" ADD CONSTRAINT "EngagementSectionNa_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "ExaminationNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementMeeting" ADD CONSTRAINT "EngagementMeeting_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_sourceResponseId_fkey" FOREIGN KEY ("sourceResponseId") REFERENCES "ExaminationResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BmResponseBatch" ADD CONSTRAINT "BmResponseBatch_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositiveObservation" ADD CONSTRAINT "PositiveObservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PositiveObservation" ADD CONSTRAINT "PositiveObservation_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationQuestion" ADD CONSTRAINT "ExaminationQuestion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanAccount" ADD CONSTRAINT "LoanAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanAccount" ADD CONSTRAINT "LoanAccount_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplingConfig" ADD CONSTRAINT "SamplingConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplingConfig" ADD CONSTRAINT "SamplingConfig_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountExamResponse" ADD CONSTRAINT "AccountExamResponse_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountExamResponse" ADD CONSTRAINT "AccountExamResponse_loanAccountId_fkey" FOREIGN KEY ("loanAccountId") REFERENCES "LoanAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountExamResponse" ADD CONSTRAINT "AccountExamResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "ExaminationQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

