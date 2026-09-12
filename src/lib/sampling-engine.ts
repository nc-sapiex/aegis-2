/**
 * Sampling Engine — Deterministic Bucket-Fill Algorithm
 *
 * Pure business logic — no DB dependencies.
 * Selects a representative sample of loan accounts from a portfolio
 * using criteria bucket allocations defined by the HIA (Head of Internal Audit).
 *
 * Complies with SMPL-04 requirement for auto-select sample accounts.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Bucket types matching SamplingConfig.criteriaBuckets JSONB shape (Phase 27). */
export type BucketName =
  | "NEWLY_SANCTIONED"
  | "AMOUNT_WISE"
  | "AGE_WISE"
  | "DPD_WISE"
  | "PRIOR_OBSERVATIONS";

/**
 * One entry in criteriaBuckets JSONB array from SamplingConfig model.
 * All pct values in a config must sum to 100.
 */
export interface BucketAllocation {
  bucket: BucketName;
  /** Percentage of total sample to allocate to this bucket (0-100). */
  pct: number;
  description: string;
}

/**
 * A loan account in the shape the sampling engine expects.
 * Compatible with the LoanAccount Prisma model from Phase 27.
 * Decimal fields are provided as number (caller converts Prisma.Decimal).
 */
export interface LoanAccountForSampling {
  id: string;
  accountNo: string;
  borrowerName: string;
  productType: string;
  sanctionAmount: number;
  sanctionDate: Date;
  outstandingAmount: number;
  assetClass: string; // "STANDARD" | "SMA0" | "SMA1" | "SMA2" | "NPA_SUB" | "NPA_DOUBTFUL" | "NPA_LOSS"
  dpd: number;
  metadata: Record<string, unknown> | null;
  isSampled: boolean;
  sampledAt: Date | null;
  /** Flag from upload file — accounts with prior audit observations. */
  hasPriorObservations: boolean;
}

/** An account selected into the sample, tagged with its winning bucket. */
export interface SampledAccount {
  accountId: string;
  bucket: BucketName;
}

/**
 * Warning generated when a bucket had fewer eligible accounts than requested.
 * Surplus is redistributed to another bucket.
 */
export interface RedistributionWarning {
  /** Bucket that could not fill its allocation. */
  bucket: BucketName;
  /** Number of accounts the bucket was allocated. */
  requested: number;
  /** Number of accounts actually filled from eligible pool. */
  filled: number;
  /** Difference: requested - filled. Always > 0 in a warning. */
  shortfall: number;
  /** Bucket name that absorbed the shortfall. */
  redistributedTo: BucketName | "NONE";
}

/** Input to the sampling algorithm. */
export interface SamplingInput {
  /** Full loan portfolio for this engagement + module. */
  accounts: LoanAccountForSampling[];
  /** Overall sample size as a percentage of total portfolio (e.g., 10 = 10%). */
  sampleSizePct: number;
  /** Allocation config — must contain at least one bucket. */
  criteriaBuckets: BucketAllocation[];
}

/** Output from the sampling algorithm. */
export interface SamplingResult {
  /** Accounts selected into the sample, each tagged to its winning bucket. */
  sampledAccounts: SampledAccount[];
  /** Warnings for buckets that had insufficient eligible accounts. */
  warnings: RedistributionWarning[];
  /** Total accounts the algorithm intended to select (= Math.round(total * sampleSizePct / 100)). */
  totalRequested: number;
  /** Actual number of accounts selected (may be < totalRequested if portfolio too small). */
  totalSelected: number;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Number of milliseconds in a year (365.25 days). */
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Return true if the account was sanctioned within the last 12 months of `now`. */
function isNewlySanctioned(
  account: LoanAccountForSampling,
  now: Date,
): boolean {
  return now.getTime() - account.sanctionDate.getTime() <= MS_PER_YEAR;
}

/**
 * Build the eligible pool for a given bucket.
 * The pool is sorted deterministically so that the first N accounts are
 * always the "best" candidates for audit purposes.
 *
 * Tie-breaking secondary/tertiary sorts ensure stability across runs.
 */
function buildPool(
  bucket: BucketName,
  accounts: LoanAccountForSampling[],
  now: Date,
): LoanAccountForSampling[] {
  switch (bucket) {
    case "NEWLY_SANCTIONED": {
      // Only accounts sanctioned in the last 12 months.
      // Order: highest DPD → highest outstanding → oldest sanction date
      const pool = accounts.filter((a) => isNewlySanctioned(a, now));
      return pool.slice().sort((a, b) => {
        if (b.dpd !== a.dpd) return b.dpd - a.dpd;
        if (b.outstandingAmount !== a.outstandingAmount)
          return b.outstandingAmount - a.outstandingAmount;
        return a.sanctionDate.getTime() - b.sanctionDate.getTime();
      });
    }

    case "AMOUNT_WISE": {
      // All accounts — highest outstanding first.
      // Tie-break: highest DPD → oldest sanction date → id (stable)
      return accounts.slice().sort((a, b) => {
        if (b.outstandingAmount !== a.outstandingAmount)
          return b.outstandingAmount - a.outstandingAmount;
        if (b.dpd !== a.dpd) return b.dpd - a.dpd;
        if (a.sanctionDate.getTime() !== b.sanctionDate.getTime())
          return a.sanctionDate.getTime() - b.sanctionDate.getTime();
        return a.id.localeCompare(b.id);
      });
    }

    case "AGE_WISE": {
      // All accounts — oldest sanction date first (longest loan tenure).
      // Tie-break: highest DPD → highest outstanding → id (stable)
      return accounts.slice().sort((a, b) => {
        if (a.sanctionDate.getTime() !== b.sanctionDate.getTime())
          return a.sanctionDate.getTime() - b.sanctionDate.getTime();
        if (b.dpd !== a.dpd) return b.dpd - a.dpd;
        if (b.outstandingAmount !== a.outstandingAmount)
          return b.outstandingAmount - a.outstandingAmount;
        return a.id.localeCompare(b.id);
      });
    }

    case "DPD_WISE": {
      // All accounts — highest DPD first (most overdue).
      // Tie-break: highest outstanding → oldest sanction date → id (stable)
      return accounts.slice().sort((a, b) => {
        if (b.dpd !== a.dpd) return b.dpd - a.dpd;
        if (b.outstandingAmount !== a.outstandingAmount)
          return b.outstandingAmount - a.outstandingAmount;
        if (a.sanctionDate.getTime() !== b.sanctionDate.getTime())
          return a.sanctionDate.getTime() - b.sanctionDate.getTime();
        return a.id.localeCompare(b.id);
      });
    }

    case "PRIOR_OBSERVATIONS": {
      // Only accounts with the manual hasPriorObservations flag from upload.
      // Order: highest DPD → highest outstanding → id (stable)
      const pool = accounts.filter((a) => a.hasPriorObservations);
      return pool.slice().sort((a, b) => {
        if (b.dpd !== a.dpd) return b.dpd - a.dpd;
        if (b.outstandingAmount !== a.outstandingAmount)
          return b.outstandingAmount - a.outstandingAmount;
        return a.id.localeCompare(b.id);
      });
    }

    default: {
      // Exhaustiveness guard — should never happen with correct BucketName type.
      return [];
    }
  }
}

/**
 * Calculate per-bucket counts from the overall sample count and bucket percentages.
 * Uses Math.round per bucket, then trims to totalSampleCount to avoid rounding inflation.
 */
function calculateBucketCounts(
  totalSampleCount: number,
  buckets: BucketAllocation[],
): Map<BucketName, number> {
  const counts = new Map<BucketName, number>();
  let allocated = 0;

  for (const b of buckets) {
    const count = Math.round((totalSampleCount * b.pct) / 100);
    counts.set(b.bucket, count);
    allocated += count;
  }

  // If rounding caused sum > totalSampleCount, reduce the largest bucket by 1
  if (allocated > totalSampleCount) {
    // Find the bucket with highest pct to absorb the reduction
    const sortedByPct = [...buckets].sort((a, b) => b.pct - a.pct);
    let excess = allocated - totalSampleCount;
    for (const b of sortedByPct) {
      if (excess <= 0) break;
      const current = counts.get(b.bucket) ?? 0;
      if (current > 0) {
        counts.set(b.bucket, current - 1);
        excess--;
      }
    }
  }

  return counts;
}

// ─── Core Algorithm ───────────────────────────────────────────────────────────

/**
 * Generate a deterministic, deduplicated sample from the loan portfolio.
 *
 * Algorithm:
 * 1. Calculate totalSampleCount = Math.round(accounts.length * sampleSizePct / 100)
 * 2. Calculate per-bucket counts proportionally, trimming rounding excess
 * 3. Process buckets in order of descending pct (largest first)
 *    a. Build eligible pool (filtered + sorted)
 *    b. Exclude already-selected accounts
 *    c. Take min(requested, available)
 *    d. If shortfall, record it for redistribution
 * 4. Redistribute shortfalls to buckets with remaining capacity
 * 5. Return SamplingResult
 */
export function generateSample(input: SamplingInput): SamplingResult {
  const { accounts, sampleSizePct, criteriaBuckets } = input;
  const now = new Date();

  // Edge case: empty portfolio
  if (accounts.length === 0 || criteriaBuckets.length === 0) {
    return {
      sampledAccounts: [],
      warnings: [],
      totalRequested: 0,
      totalSelected: 0,
    };
  }

  const totalRequested = Math.round((accounts.length * sampleSizePct) / 100);

  if (totalRequested === 0) {
    return {
      sampledAccounts: [],
      warnings: [],
      totalRequested: 0,
      totalSelected: 0,
    };
  }

  // Sort buckets: largest pct first; ties broken alphabetically by bucket name (deterministic)
  const sortedBuckets = [...criteriaBuckets].sort((a, b) => {
    if (b.pct !== a.pct) return b.pct - a.pct;
    return a.bucket.localeCompare(b.bucket);
  });

  // Calculate per-bucket target counts (with rounding correction)
  const bucketTargets = calculateBucketCounts(totalRequested, sortedBuckets);

  // Track selected account IDs for deduplication
  const selectedIds = new Set<string>();
  const sampledAccounts: SampledAccount[] = [];

  // Track shortfalls for redistribution after the first pass
  const shortfalls: Array<{ from: BucketName; amount: number }> = [];

  // ── First pass: fill each bucket ────────────────────────────────────────────
  for (const b of sortedBuckets) {
    const target = bucketTargets.get(b.bucket) ?? 0;
    if (target === 0) continue;

    const pool = buildPool(b.bucket, accounts, now);
    // Exclude already-selected accounts (deduplication — first bucket wins)
    const eligible = pool.filter((a) => !selectedIds.has(a.id));

    const canTake = Math.min(target, eligible.length);
    const taken = eligible.slice(0, canTake);

    for (const account of taken) {
      selectedIds.add(account.id);
      sampledAccounts.push({ accountId: account.id, bucket: b.bucket });
    }

    if (canTake < target) {
      shortfalls.push({ from: b.bucket, amount: target - canTake });
    }
  }

  // ── Redistribution pass ──────────────────────────────────────────────────────
  const warnings: RedistributionWarning[] = [];

  for (const shortfall of shortfalls) {
    let remaining = shortfall.amount;

    // Find buckets with remaining capacity, in priority order (largest pct first)
    // A bucket has remaining capacity if it has eligible accounts beyond what it already took
    let redistributedTo: BucketName | "NONE" = "NONE";

    for (const targetBucket of sortedBuckets) {
      if (targetBucket.bucket === shortfall.from) continue;
      if (remaining <= 0) break;

      // Build pool for target bucket again, excluding all selected so far
      const pool = buildPool(targetBucket.bucket, accounts, now);
      const eligible = pool.filter((a) => !selectedIds.has(a.id));

      if (eligible.length === 0) continue;

      const canTake = Math.min(remaining, eligible.length);
      const taken = eligible.slice(0, canTake);

      for (const account of taken) {
        selectedIds.add(account.id);
        sampledAccounts.push({
          accountId: account.id,
          bucket: targetBucket.bucket,
        });
      }

      remaining -= taken.length;

      if (redistributedTo === "NONE") {
        redistributedTo = targetBucket.bucket;
      }
    }

    // Record the warning
    const filledCount =
      (bucketTargets.get(shortfall.from) ?? 0) - shortfall.amount;
    const requestedCount = bucketTargets.get(shortfall.from) ?? 0;

    warnings.push({
      bucket: shortfall.from,
      requested: requestedCount,
      filled: filledCount,
      shortfall: shortfall.amount,
      redistributedTo,
    });
  }

  return {
    sampledAccounts,
    warnings,
    totalRequested,
    totalSelected: sampledAccounts.length,
  };
}
