-- CreateEnum
CREATE TYPE "ObservationPertainsTo" AS ENUM ('FINANCE', 'OPERATIONS', 'LEGAL_RECOVERY', 'HR', 'IT');

-- CreateEnum
CREATE TYPE "ActionPointKind" AS ENUM ('FINDING', 'POSITIVE');

-- CreateEnum
CREATE TYPE "ModuleDomain" AS ENUM ('CREDIT', 'DEPOSITS', 'FOREX', 'CASH', 'KYC', 'IT', 'HR', 'ADMIN', 'GOVT', 'TREASURY', 'OTHER');

-- CreateEnum
CREATE TYPE "ExaminationKind" AS ENUM ('CHECKLIST', 'POPULATION_SAMPLE');

-- CreateEnum
CREATE TYPE "ContentOrigin" AS ENUM ('PACK', 'BANK');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'AUDIT_CHAIN_TAMPER_DETECTED';

-- AlterEnum
ALTER TYPE "ScoreLabel" ADD VALUE 'MARGINALLY_COMPLIANT';

-- DropForeignKey
ALTER TABLE "AccountExamResponse" DROP CONSTRAINT "AccountExamResponse_loanAccountId_fkey";

-- DropForeignKey
ALTER TABLE "AuditExaminationResponse" DROP CONSTRAINT "AuditExaminationResponse_engagementId_fkey";

-- DropForeignKey
ALTER TABLE "AuditExaminationResponse" DROP CONSTRAINT "AuditExaminationResponse_itemId_fkey";

-- DropForeignKey
ALTER TABLE "AuditExaminationResponse" DROP CONSTRAINT "AuditExaminationResponse_observationId_fkey";

-- DropForeignKey
ALTER TABLE "AuditExaminationResponse" DROP CONSTRAINT "AuditExaminationResponse_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "AuditSectionInstance" DROP CONSTRAINT "AuditSectionInstance_engagementId_fkey";

-- DropForeignKey
ALTER TABLE "AuditSectionInstance" DROP CONSTRAINT "AuditSectionInstance_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "EngagementModuleSelection" DROP CONSTRAINT "EngagementModuleSelection_engagementId_fkey";

-- DropForeignKey
ALTER TABLE "EngagementModuleSelection" DROP CONSTRAINT "EngagementModuleSelection_moduleNodeId_fkey";

-- DropForeignKey
ALTER TABLE "EngagementSectionNa" DROP CONSTRAINT "EngagementSectionNa_moduleId_fkey";

-- DropForeignKey
ALTER TABLE "Evidence" DROP CONSTRAINT "Evidence_examinationResponseId_fkey";

-- DropForeignKey
ALTER TABLE "ExaminationArea" DROP CONSTRAINT "ExaminationArea_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "ExaminationItem" DROP CONSTRAINT "ExaminationItem_areaId_fkey";

-- DropForeignKey
ALTER TABLE "ExaminationItem" DROP CONSTRAINT "ExaminationItem_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "LoanAccount" DROP CONSTRAINT "LoanAccount_engagementId_fkey";

-- DropForeignKey
ALTER TABLE "LoanAccount" DROP CONSTRAINT "LoanAccount_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "LoanReview" DROP CONSTRAINT "LoanReview_engagementId_fkey";

-- DropForeignKey
ALTER TABLE "LoanReview" DROP CONSTRAINT "LoanReview_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "PositiveObservation" DROP CONSTRAINT "PositiveObservation_engagementId_fkey";

-- DropForeignKey
ALTER TABLE "PositiveObservation" DROP CONSTRAINT "PositiveObservation_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "SmaNpaEntry" DROP CONSTRAINT "SmaNpaEntry_engagementId_fkey";

-- DropForeignKey
ALTER TABLE "SmaNpaEntry" DROP CONSTRAINT "SmaNpaEntry_tenantId_fkey";

-- DropIndex
DROP INDEX "AccountExamResponse_engagementId_loanAccountId_questionId_key";

-- DropIndex
DROP INDEX "AccountExamResponse_loanAccountId_idx";

-- DropIndex
DROP INDEX "Evidence_examinationResponseId_idx";

-- DropIndex
DROP INDEX "ExaminationQuestion_tenantId_moduleCode_displayOrder_idx";

-- DropIndex
DROP INDEX "ExaminationQuestion_tenantId_moduleCode_isActive_idx";

-- DropIndex
DROP INDEX "ExaminationQuestion_tenantId_moduleCode_text_key";

-- DropIndex
DROP INDEX "SamplingConfig_engagementId_moduleCode_key";

-- AlterTable
ALTER TABLE "AccountExamResponse" DROP COLUMN "loanAccountId",
ADD COLUMN     "recordId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "ActionPoint" DROP COLUMN "moduleCode",
ADD COLUMN     "kind" "ActionPointKind" NOT NULL DEFAULT 'FINDING',
ADD COLUMN     "moduleId" UUID NOT NULL;

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "prevHash" BYTEA,
ADD COLUMN     "rowHash" BYTEA,
ALTER COLUMN "sequenceNumber" DROP DEFAULT;
DROP SEQUENCE "AuditLog_sequenceNumber_seq";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "hasAtm" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasCurrencyChest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasForex" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasGovtBusiness" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasLockers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "loanProducts" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Evidence" DROP COLUMN "examinationResponseId";

-- AlterTable
ALTER TABLE "ExaminationNode" ADD COLUMN     "moduleId" UUID,
ADD COLUMN     "origin" "ContentOrigin" NOT NULL DEFAULT 'BANK';

-- AlterTable
ALTER TABLE "ExaminationQuestion" DROP COLUMN "moduleCode",
ADD COLUMN     "moduleId" UUID NOT NULL,
ADD COLUMN     "origin" "ContentOrigin" NOT NULL DEFAULT 'BANK';

-- AlterTable
ALTER TABLE "ExaminationResponse" DROP COLUMN "workingNotes",
ADD COLUMN     "remarks" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Observation" DROP COLUMN "cause",
DROP COLUMN "condition",
DROP COLUMN "criteria",
DROP COLUMN "effect",
DROP COLUMN "observationType",
ADD COLUMN     "amountInvolved" DECIMAL(15,2),
ADD COLUMN     "branchComments" TEXT,
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "moduleId" UUID NOT NULL,
ADD COLUMN     "pertainsTo" "ObservationPertainsTo" NOT NULL,
ADD COLUMN     "sourceResponseId" UUID;

-- AlterTable
ALTER TABLE "SamplingConfig" DROP COLUMN "moduleCode",
ADD COLUMN     "moduleId" UUID NOT NULL;

-- DropTable
DROP TABLE "AuditExaminationResponse";

-- DropTable
DROP TABLE "AuditSectionInstance";

-- DropTable
DROP TABLE "EngagementModuleSelection";

-- DropTable
DROP TABLE "ExaminationArea";

-- DropTable
DROP TABLE "ExaminationItem";

-- DropTable
DROP TABLE "LoanAccount";

-- DropTable
DROP TABLE "LoanReview";

-- DropTable
DROP TABLE "PositiveObservation";

-- DropTable
DROP TABLE "SmaNpaEntry";

-- DropEnum
DROP TYPE "AuditSectionStatus";

-- DropEnum
DROP TYPE "ExaminationStatus";

-- CreateTable
CREATE TABLE "AuditChainHead" (
    "tenantId" UUID NOT NULL,
    "lastSequence" BIGINT NOT NULL DEFAULT 0,
    "lastHash" BYTEA NOT NULL,
    "lastVerifiedSequence" BIGINT NOT NULL DEFAULT 0,
    "lastVerifiedHash" BYTEA,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditChainHead_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "AuditChainVerification" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ok" BOOLEAN NOT NULL,
    "firstBadSequence" BIGINT,

    CONSTRAINT "AuditChainVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditModule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" "ModuleDomain" NOT NULL,
    "kinds" "ExaminationKind"[],
    "applicability" JSONB NOT NULL DEFAULT '{}',
    "weight" INTEGER NOT NULL DEFAULT 1,
    "packId" UUID,
    "packVersion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentPackInstall" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "packCode" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedById" UUID NOT NULL,
    "uninstalledAt" TIMESTAMP(3),

    CONSTRAINT "ContentPackInstall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementModule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "packVersion" TEXT,
    "isAutoSelected" BOOLEAN NOT NULL DEFAULT false,
    "selectionReason" TEXT,
    "removalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementStatement" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "nodeId" UUID,
    "questionId" UUID,
    "text" TEXT NOT NULL,
    "reference" TEXT,
    "weight" DECIMAL(5,4) NOT NULL,
    "isCritical" BOOLEAN NOT NULL,
    "origin" "ContentOrigin" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EngagementSectionVisit" (
    "engagementId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sectionId" UUID NOT NULL,
    "visitedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EngagementSectionVisit_pkey" PRIMARY KEY ("engagementId","userId")
);

-- CreateTable
CREATE TABLE "PopulationRecord" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "engagementId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "recordKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "classification" TEXT NOT NULL,
    "metadata" JSONB,
    "isSampled" BOOLEAN NOT NULL DEFAULT false,
    "sampledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopulationRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PopulationSchema" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PopulationSchema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditChainVerification_tenantId_verifiedAt_idx" ON "AuditChainVerification"("tenantId", "verifiedAt");

-- CreateIndex
CREATE INDEX "AuditModule_tenantId_idx" ON "AuditModule"("tenantId");

-- CreateIndex
CREATE INDEX "AuditModule_tenantId_isActive_idx" ON "AuditModule"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AuditModule_tenantId_code_key" ON "AuditModule"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ContentPackInstall_tenantId_idx" ON "ContentPackInstall"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPackInstall_tenantId_packCode_key" ON "ContentPackInstall"("tenantId", "packCode");

-- CreateIndex
CREATE INDEX "EngagementModule_tenantId_idx" ON "EngagementModule"("tenantId");

-- CreateIndex
CREATE INDEX "EngagementModule_engagementId_idx" ON "EngagementModule"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementModule_engagementId_moduleId_key" ON "EngagementModule"("engagementId", "moduleId");

-- CreateIndex
CREATE INDEX "EngagementStatement_tenantId_idx" ON "EngagementStatement"("tenantId");

-- CreateIndex
CREATE INDEX "EngagementStatement_engagementId_idx" ON "EngagementStatement"("engagementId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementStatement_engagementId_nodeId_key" ON "EngagementStatement"("engagementId", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "EngagementStatement_engagementId_questionId_key" ON "EngagementStatement"("engagementId", "questionId");

-- CreateIndex
CREATE INDEX "EngagementSectionVisit_engagementId_idx" ON "EngagementSectionVisit"("engagementId");

-- CreateIndex
CREATE INDEX "PopulationRecord_tenantId_idx" ON "PopulationRecord"("tenantId");

-- CreateIndex
CREATE INDEX "PopulationRecord_engagementId_idx" ON "PopulationRecord"("engagementId");

-- CreateIndex
CREATE INDEX "PopulationRecord_engagementId_moduleId_idx" ON "PopulationRecord"("engagementId", "moduleId");

-- CreateIndex
CREATE INDEX "PopulationRecord_engagementId_isSampled_idx" ON "PopulationRecord"("engagementId", "isSampled");

-- CreateIndex
CREATE INDEX "PopulationRecord_engagementId_classification_idx" ON "PopulationRecord"("engagementId", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "PopulationRecord_engagementId_moduleId_recordKey_key" ON "PopulationRecord"("engagementId", "moduleId", "recordKey");

-- CreateIndex
CREATE UNIQUE INDEX "PopulationSchema_moduleId_key" ON "PopulationSchema"("moduleId");

-- CreateIndex
CREATE INDEX "PopulationSchema_tenantId_idx" ON "PopulationSchema"("tenantId");

-- CreateIndex
CREATE INDEX "AccountExamResponse_recordId_idx" ON "AccountExamResponse"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountExamResponse_engagementId_recordId_questionId_key" ON "AccountExamResponse"("engagementId", "recordId", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_tenantId_sequenceNumber_key" ON "AuditLog"("tenantId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "ExaminationNode_tenantId_moduleId_idx" ON "ExaminationNode"("tenantId", "moduleId");

-- CreateIndex
CREATE INDEX "ExaminationQuestion_tenantId_moduleId_isActive_idx" ON "ExaminationQuestion"("tenantId", "moduleId", "isActive");

-- CreateIndex
CREATE INDEX "ExaminationQuestion_tenantId_moduleId_displayOrder_idx" ON "ExaminationQuestion"("tenantId", "moduleId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExaminationQuestion_tenantId_moduleId_text_key" ON "ExaminationQuestion"("tenantId", "moduleId", "text");

-- CreateIndex
CREATE UNIQUE INDEX "SamplingConfig_engagementId_moduleId_key" ON "SamplingConfig"("engagementId", "moduleId");

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_sourceResponseId_fkey" FOREIGN KEY ("sourceResponseId") REFERENCES "ExaminationResponse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_sourceActionPointId_fkey" FOREIGN KEY ("sourceActionPointId") REFERENCES "ActionPoint"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditChainHead" ADD CONSTRAINT "AuditChainHead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditChainVerification" ADD CONSTRAINT "AuditChainVerification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditModule" ADD CONSTRAINT "AuditModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditModule" ADD CONSTRAINT "AuditModule_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ContentPackInstall"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPackInstall" ADD CONSTRAINT "ContentPackInstall_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPackInstall" ADD CONSTRAINT "ContentPackInstall_installedById_fkey" FOREIGN KEY ("installedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationNode" ADD CONSTRAINT "ExaminationNode_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementModule" ADD CONSTRAINT "EngagementModule_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementModule" ADD CONSTRAINT "EngagementModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementStatement" ADD CONSTRAINT "EngagementStatement_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSectionVisit" ADD CONSTRAINT "EngagementSectionVisit_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementSectionNa" ADD CONSTRAINT "EngagementSectionNa_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPoint" ADD CONSTRAINT "ActionPoint_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminationQuestion" ADD CONSTRAINT "ExaminationQuestion_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopulationRecord" ADD CONSTRAINT "PopulationRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopulationRecord" ADD CONSTRAINT "PopulationRecord_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "AuditEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopulationRecord" ADD CONSTRAINT "PopulationRecord_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopulationSchema" ADD CONSTRAINT "PopulationSchema_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PopulationSchema" ADD CONSTRAINT "PopulationSchema_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SamplingConfig" ADD CONSTRAINT "SamplingConfig_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "AuditModule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountExamResponse" ADD CONSTRAINT "AccountExamResponse_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "PopulationRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

