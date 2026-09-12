"use server";

import { revalidatePath } from "next/cache";
import { getRequiredSession } from "@/data-access/session";
import { withAuditedMutation, userActor } from "@/data-access/audited-mutation";
import { hasPermission } from "@/lib/permissions";
import { logger } from "@/lib/logger";
import { GenerateSampleSchema, type GenerateSampleInput } from "./schemas";
import { generateSample, type BucketAllocation } from "@/lib/sampling-engine";
import {
  getSamplingConfig,
  getLoanAccountsForSampling,
} from "@/data-access/sampling";

/**
 * Generate a loan account sample using the saved sampling criteria.
 *
 * Security:
 * - Requires "audit_execution:manage_sections" permission (HIA / CAE role)
 *
 * Algorithm:
 * 1. Fetch the SamplingConfig for this engagement + module
 * 2. Fetch all LoanAccounts for this engagement + module
 * 3. Call the pure sampling engine (generateSample)
 * 4. In a transaction:
 *    a. Reset previously sampled accounts
 *    b. Mark newly sampled accounts (isSampled=true + samplingBucket in metadata)
 *    c. Lock the SamplingConfig (isLocked=true, sampleGenerated=true)
 *
 * Re-generation is supported: a second call resets the previous sample first.
 *
 * SMPL-04: Auto-select accounts from portfolio based on criteria buckets
 */
export async function generateSampleAction(input: GenerateSampleInput) {
  const session = await getRequiredSession();
  const userRoles = session.user.roles;
  const tenantId = session.user.tenantId;

  if (!hasPermission(userRoles, "audit_execution:manage_sections")) {
    return {
      success: false as const,
      error: "You do not have permission to generate samples.",
    };
  }

  const parsed = GenerateSampleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false as const,
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { engagementId, moduleCode } = parsed.data;

  try {
    // 1. Fetch sampling config (validates that criteria have been saved)
    const config = await getSamplingConfig(session, engagementId, moduleCode);
    if (!config) {
      return {
        success: false as const,
        error:
          "No sampling criteria found for this module. Configure criteria first.",
      };
    }

    // 2. Fetch all loan accounts for this module
    const accounts = await getLoanAccountsForSampling(
      session,
      engagementId,
      moduleCode,
    );

    if (accounts.length === 0) {
      return {
        success: false as const,
        error:
          "No loan accounts found for this module. Upload loan data first.",
      };
    }

    // 3. Run the pure sampling algorithm
    const samplingResult = generateSample({
      accounts,
      sampleSizePct: Number(config.sampleSizePct),
      criteriaBuckets: config.criteriaBuckets as unknown as BucketAllocation[],
    });

    // 4. Persist sampling results in a transaction. Marking accounts sampled
    // writes LoanAccount, which carries an audit trigger, so the transaction
    // runs through withAuditedMutation to set the context the trigger reads.
    await withAuditedMutation(
      userActor(session),
      "loan_sample.generated",
      async (tx) => {
        // a. Reset all previously sampled accounts for this engagement + module
        // Fetch currently sampled accounts to update their metadata
        const previouslySampled = await tx.loanAccount.findMany({
          where: { engagementId, moduleCode, tenantId, isSampled: true },
          select: { id: true, metadata: true },
        });

        for (const account of previouslySampled) {
          const existingMeta =
            account.metadata && typeof account.metadata === "object"
              ? (account.metadata as Record<string, unknown>)
              : {};

          await tx.loanAccount.update({
            where: { id: account.id },
            data: {
              isSampled: false,
              sampledAt: null,
              metadata: { ...existingMeta, samplingBucket: null },
            },
          });
        }

        // b. Mark newly selected accounts as sampled
        const sampledAt = new Date();
        for (const sampledAccount of samplingResult.sampledAccounts) {
          // Fetch current metadata to preserve other fields
          const current = await tx.loanAccount.findFirst({
            where: { id: sampledAccount.accountId, tenantId },
            select: { metadata: true },
          });

          const existingMeta =
            current?.metadata && typeof current.metadata === "object"
              ? (current.metadata as Record<string, unknown>)
              : {};

          await tx.loanAccount.update({
            where: { id: sampledAccount.accountId },
            data: {
              isSampled: true,
              sampledAt,
              metadata: {
                ...existingMeta,
                samplingBucket: sampledAccount.bucket,
              },
            },
          });
        }

        // c. Lock the SamplingConfig — prevents further criteria changes
        await tx.samplingConfig.update({
          where: { id: config.id },
          data: {
            isLocked: true,
            lockedAt: sampledAt,
            lockedById: session.user.id,
            sampleGenerated: true,
            sampleGeneratedAt: sampledAt,
            sampleCount: samplingResult.totalSelected,
          },
        });
      },
    );

    revalidatePath(`/audit-execution/${engagementId}/rbia/sampling`);

    logger.info(
      {
        action: "generate_sample",
        engagementId,
        moduleCode,
        configId: config.id,
        totalAccounts: accounts.length,
        totalSelected: samplingResult.totalSelected,
        warningCount: samplingResult.warnings.length,
        userId: session.user.id,
        tenantId,
      },
      "Sample generated and locked",
    );

    return {
      success: true as const,
      data: {
        totalSelected: samplingResult.totalSelected,
        totalRequested: samplingResult.totalRequested,
        warnings: samplingResult.warnings,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate sample.";
    logger.error(
      { error, action: "generate_sample", engagementId, tenantId },
      message,
    );
    return { success: false as const, error: message };
  }
}
