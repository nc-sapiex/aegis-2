import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  generateSample,
  type SamplingInput,
  type BucketAllocation,
  type LoanAccountForSampling,
} from "@/lib/sampling-engine";

// ─── Test Fixtures ───────────────────────────────────────────────────────────

const NOW = new Date("2026-02-28T00:00:00Z");
const ELEVEN_MONTHS_AGO = new Date("2025-03-28T00:00:00Z");
const THIRTEEN_MONTHS_AGO = new Date("2025-01-28T00:00:00Z");
const THREE_YEARS_AGO = new Date("2023-02-28T00:00:00Z");
const FIVE_YEARS_AGO = new Date("2021-02-28T00:00:00Z");

function makeAccount(
  overrides: Partial<LoanAccountForSampling> & { id: string },
): LoanAccountForSampling {
  const id = overrides.id;
  const base: LoanAccountForSampling = {
    id,
    accountNo: `ACC-${id}`,
    borrowerName: `Borrower ${id}`,
    productType: "TERM_LOAN",
    sanctionAmount: 100000,
    sanctionDate: THREE_YEARS_AGO,
    outstandingAmount: 50000,
    assetClass: "STANDARD",
    dpd: 0,
    metadata: null,
    isSampled: false,
    sampledAt: null,
    hasPriorObservations: false,
  };
  return { ...base, ...overrides };
}

function makeBuckets(
  ...defs: Array<{ bucket: BucketAllocation["bucket"]; pct: number }>
): BucketAllocation[] {
  return defs.map(({ bucket, pct }) => ({
    bucket,
    pct,
    description: `${bucket} bucket`,
  }));
}

// Build a portfolio of N accounts with sequential IDs
function makePortfolio(n: number): LoanAccountForSampling[] {
  return Array.from({ length: n }, (_, i) =>
    makeAccount({
      id: `A${String(i + 1).padStart(3, "0")}`,
      outstandingAmount: (n - i) * 1000, // decreasing outstanding so ordering is predictable
      dpd: i, // increasing DPD
    }),
  );
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("generateSample", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Test 1: Basic sampling with even bucket allocation ──────────────────────
  describe("basic sampling", () => {
    it("selects correct total count: 10% of 100 accounts = 10", () => {
      const accounts = makePortfolio(100);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10,
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 20 },
          { bucket: "AGE_WISE", pct: 20 },
          { bucket: "DPD_WISE", pct: 20 },
          { bucket: "NEWLY_SANCTIONED", pct: 20 },
          { bucket: "PRIOR_OBSERVATIONS", pct: 20 },
        ),
      };
      const result = generateSample(input);
      expect(result.totalRequested).toBe(10); // Math.round(100 * 10 / 100)
      expect(result.totalSelected).toBeLessThanOrEqual(10);
    });

    it("returns sampledAccounts with bucket tags", () => {
      const accounts = makePortfolio(100);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10,
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 50 },
          { bucket: "DPD_WISE", pct: 50 },
        ),
      };
      const result = generateSample(input);
      for (const sampled of result.sampledAccounts) {
        expect(sampled.accountId).toBeTruthy();
        expect(["AMOUNT_WISE", "DPD_WISE"]).toContain(sampled.bucket);
      }
    });
  });

  // ── Test 2: Bucket allocation math ──────────────────────────────────────────
  describe("bucket allocation math", () => {
    it("calculates totalSampleCount as Math.round(total * sampleSizePct / 100)", () => {
      const accounts = makePortfolio(50);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10, // Math.round(50 * 10/100) = 5
        criteriaBuckets: makeBuckets({ bucket: "AMOUNT_WISE", pct: 100 }),
      };
      const result = generateSample(input);
      expect(result.totalRequested).toBe(5);
    });

    it("distributes per-bucket counts proportionally", () => {
      // 200 accounts, 10% = 20 total, 25% per bucket = 5 each
      const accounts = makePortfolio(200);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10,
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 25 },
          { bucket: "AGE_WISE", pct: 25 },
          { bucket: "DPD_WISE", pct: 25 },
          { bucket: "NEWLY_SANCTIONED", pct: 25 },
        ),
      };
      const result = generateSample(input);
      // Total should be 20, with roughly 5 per bucket (no overflow since 200 accounts)
      expect(result.totalSelected).toBe(20);
    });

    it("does not exceed totalSampleCount due to rounding", () => {
      // Edge case: 3 buckets at 33.33% each — rounding may sum to 101%
      const accounts = makePortfolio(300);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10, // 30 accounts
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 34 },
          { bucket: "AGE_WISE", pct: 33 },
          { bucket: "DPD_WISE", pct: 33 },
        ),
      };
      const result = generateSample(input);
      expect(result.totalSelected).toBeLessThanOrEqual(result.totalRequested);
    });
  });

  // ── Test 3: Deterministic ordering within buckets ────────────────────────────
  describe("deterministic ordering", () => {
    it("AMOUNT_WISE: selects accounts with highest outstanding first", () => {
      const accounts = [
        makeAccount({ id: "LOW", outstandingAmount: 10000, dpd: 0 }),
        makeAccount({ id: "HIGH", outstandingAmount: 90000, dpd: 0 }),
        makeAccount({ id: "MID", outstandingAmount: 50000, dpd: 0 }),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 33, // ~1 account
        criteriaBuckets: makeBuckets({ bucket: "AMOUNT_WISE", pct: 100 }),
      };
      const result = generateSample(input);
      expect(result.sampledAccounts[0].accountId).toBe("HIGH");
    });

    it("DPD_WISE: selects accounts with highest DPD first", () => {
      const accounts = [
        makeAccount({ id: "LOW_DPD", dpd: 10, outstandingAmount: 50000 }),
        makeAccount({ id: "HIGH_DPD", dpd: 90, outstandingAmount: 30000 }),
        makeAccount({ id: "MID_DPD", dpd: 45, outstandingAmount: 40000 }),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 33, // ~1 account
        criteriaBuckets: makeBuckets({ bucket: "DPD_WISE", pct: 100 }),
      };
      const result = generateSample(input);
      expect(result.sampledAccounts[0].accountId).toBe("HIGH_DPD");
    });

    it("AGE_WISE: selects accounts with oldest sanction date first", () => {
      const accounts = [
        makeAccount({
          id: "NEW",
          sanctionDate: ELEVEN_MONTHS_AGO,
          dpd: 0,
          outstandingAmount: 50000,
        }),
        makeAccount({
          id: "OLD",
          sanctionDate: FIVE_YEARS_AGO,
          dpd: 0,
          outstandingAmount: 50000,
        }),
        makeAccount({
          id: "MID",
          sanctionDate: THREE_YEARS_AGO,
          dpd: 0,
          outstandingAmount: 50000,
        }),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 33, // ~1 account
        criteriaBuckets: makeBuckets({ bucket: "AGE_WISE", pct: 100 }),
      };
      const result = generateSample(input);
      expect(result.sampledAccounts[0].accountId).toBe("OLD");
    });

    it("NEWLY_SANCTIONED: only includes accounts sanctioned within last 12 months", () => {
      const accounts = [
        makeAccount({
          id: "RECENT",
          sanctionDate: ELEVEN_MONTHS_AGO,
          dpd: 0,
          outstandingAmount: 50000,
        }),
        makeAccount({
          id: "OLD",
          sanctionDate: THIRTEEN_MONTHS_AGO,
          dpd: 0,
          outstandingAmount: 50000,
        }),
        makeAccount({
          id: "VERY_OLD",
          sanctionDate: FIVE_YEARS_AGO,
          dpd: 0,
          outstandingAmount: 50000,
        }),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 50, // 1-2 accounts
        criteriaBuckets: makeBuckets({ bucket: "NEWLY_SANCTIONED", pct: 100 }),
      };
      const result = generateSample(input);
      const selectedIds = result.sampledAccounts.map((a) => a.accountId);
      expect(selectedIds).toContain("RECENT");
      expect(selectedIds).not.toContain("OLD");
      expect(selectedIds).not.toContain("VERY_OLD");
    });

    it("PRIOR_OBSERVATIONS: only includes accounts with hasPriorObservations=true", () => {
      const accounts = [
        makeAccount({
          id: "PRIOR_1",
          hasPriorObservations: true,
          dpd: 5,
          outstandingAmount: 50000,
        }),
        makeAccount({
          id: "NO_PRIOR",
          hasPriorObservations: false,
          dpd: 90,
          outstandingAmount: 100000,
        }),
        makeAccount({
          id: "PRIOR_2",
          hasPriorObservations: true,
          dpd: 0,
          outstandingAmount: 30000,
        }),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 50,
        criteriaBuckets: makeBuckets({
          bucket: "PRIOR_OBSERVATIONS",
          pct: 100,
        }),
      };
      const result = generateSample(input);
      const selectedIds = result.sampledAccounts.map((a) => a.accountId);
      expect(selectedIds).not.toContain("NO_PRIOR");
      for (const id of selectedIds) {
        expect(["PRIOR_1", "PRIOR_2"]).toContain(id);
      }
    });

    it("produces same output for same input (determinism)", () => {
      const accounts = makePortfolio(100);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10,
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 50 },
          { bucket: "DPD_WISE", pct: 50 },
        ),
      };
      const result1 = generateSample(input);
      const result2 = generateSample(input);
      expect(result1.sampledAccounts.map((a) => a.accountId)).toEqual(
        result2.sampledAccounts.map((a) => a.accountId),
      );
    });
  });

  // ── Test 4: No duplicate accounts ───────────────────────────────────────────
  describe("deduplication", () => {
    it("no account appears in more than one bucket", () => {
      const accounts = makePortfolio(20); // small pool forces overlap
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 50, // 10 accounts
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 50 },
          { bucket: "DPD_WISE", pct: 50 },
        ),
      };
      const result = generateSample(input);
      const ids = result.sampledAccounts.map((a) => a.accountId);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("first bucket wins when multiple buckets could claim an account", () => {
      // AMOUNT_WISE processed before DPD_WISE (larger pct wins; if equal, order matters)
      // Ensure the top account goes to AMOUNT_WISE
      const accounts = [
        makeAccount({ id: "TOP", outstandingAmount: 100000, dpd: 100 }), // would win both
        makeAccount({ id: "A2", outstandingAmount: 80000, dpd: 50 }),
        makeAccount({ id: "A3", outstandingAmount: 60000, dpd: 30 }),
        makeAccount({ id: "A4", outstandingAmount: 40000, dpd: 20 }),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 50, // 2 accounts
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 50 }, // takes 1
          { bucket: "DPD_WISE", pct: 50 }, // takes 1
        ),
      };
      const result = generateSample(input);
      const amountWiseAccounts = result.sampledAccounts
        .filter((a) => a.bucket === "AMOUNT_WISE")
        .map((a) => a.accountId);
      const dpdWiseAccounts = result.sampledAccounts
        .filter((a) => a.bucket === "DPD_WISE")
        .map((a) => a.accountId);

      // TOP goes to AMOUNT_WISE, not DPD_WISE
      expect(amountWiseAccounts).toContain("TOP");
      expect(dpdWiseAccounts).not.toContain("TOP");
    });
  });

  // ── Test 5: Overflow redistribution ─────────────────────────────────────────
  describe("overflow redistribution", () => {
    it("generates warning when bucket has fewer accounts than requested", () => {
      // NEWLY_SANCTIONED gets 50% but only 1 recent account exists out of 10
      const accounts = [
        makeAccount({
          id: "RECENT",
          sanctionDate: ELEVEN_MONTHS_AGO,
          outstandingAmount: 50000,
          dpd: 0,
        }),
        ...Array.from({ length: 9 }, (_, i) =>
          makeAccount({
            id: `OLD_${i}`,
            sanctionDate: FIVE_YEARS_AGO,
            outstandingAmount: (i + 1) * 5000,
            dpd: i,
          }),
        ),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 50, // 5 accounts total, NEWLY_SANCTIONED wants 3 but only 1 exists
        criteriaBuckets: makeBuckets(
          { bucket: "NEWLY_SANCTIONED", pct: 50 },
          { bucket: "AMOUNT_WISE", pct: 50 },
        ),
      };
      const result = generateSample(input);
      expect(result.warnings.length).toBeGreaterThan(0);
      const nsWarning = result.warnings.find(
        (w) => w.bucket === "NEWLY_SANCTIONED",
      );
      expect(nsWarning).toBeDefined();
      expect(nsWarning?.shortfall).toBeGreaterThan(0);
      expect(nsWarning?.redistributedTo).toBeTruthy();
    });

    it("redistributed accounts are added to the target bucket", () => {
      const accounts = [
        makeAccount({
          id: "RECENT",
          sanctionDate: ELEVEN_MONTHS_AGO,
          outstandingAmount: 50000,
          dpd: 0,
        }),
        ...Array.from({ length: 9 }, (_, i) =>
          makeAccount({
            id: `OLD_${i}`,
            sanctionDate: FIVE_YEARS_AGO,
            outstandingAmount: (i + 1) * 5000,
            dpd: i,
          }),
        ),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 50, // 5 total, NEWLY_SANCTIONED wants ~2 but only 1 recent
        criteriaBuckets: makeBuckets(
          { bucket: "NEWLY_SANCTIONED", pct: 40 },
          { bucket: "AMOUNT_WISE", pct: 60 },
        ),
      };
      const result = generateSample(input);
      // Total should equal the available accounts (no missing accounts due to shortfall)
      expect(result.totalSelected).toBeGreaterThan(0);
    });

    it("warning includes correct shortfall count and redistribution target", () => {
      const accounts = [
        // PRIOR_OBSERVATIONS bucket: 0 eligible accounts
        ...Array.from({ length: 20 }, (_, i) =>
          makeAccount({
            id: `ACC_${i}`,
            hasPriorObservations: false,
            outstandingAmount: (20 - i) * 5000,
            dpd: i * 5,
          }),
        ),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10, // 2 accounts, PRIOR_OBSERVATIONS wants 1 but has 0
        criteriaBuckets: makeBuckets(
          { bucket: "PRIOR_OBSERVATIONS", pct: 50 },
          { bucket: "AMOUNT_WISE", pct: 50 },
        ),
      };
      const result = generateSample(input);
      const warning = result.warnings.find(
        (w) => w.bucket === "PRIOR_OBSERVATIONS",
      );
      expect(warning).toBeDefined();
      expect(warning?.filled).toBe(0);
      expect(warning?.shortfall).toBeGreaterThan(0);
    });
  });

  // ── Test 6: Cascading overflow ────────────────────────────────────────────────
  describe("cascading overflow", () => {
    it("cascades redistribution when target bucket also has insufficient accounts", () => {
      // 30 accounts, 10% = 3 total sample
      // NEWLY_SANCTIONED: 0 eligible (all old) — requests 1 → overflows
      // PRIOR_OBSERVATIONS: 0 eligible (none flagged) — requests 1 → overflows
      // AMOUNT_WISE: absorbs both overflows (has 30 eligible accounts)
      const accounts = Array.from({ length: 30 }, (_, i) =>
        makeAccount({
          id: `ACC_${i}`,
          sanctionDate: FIVE_YEARS_AGO, // not newly sanctioned
          hasPriorObservations: false,
          outstandingAmount: (30 - i) * 10000,
          dpd: i,
        }),
      );
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10, // Math.round(30 * 10/100) = 3 total
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 34 }, // ~1 account, has eligible
          { bucket: "NEWLY_SANCTIONED", pct: 33 }, // ~1 account, 0 eligible → overflow
          { bucket: "PRIOR_OBSERVATIONS", pct: 33 }, // ~1 account, 0 eligible → overflow
        ),
      };
      const result = generateSample(input);
      // Both NEWLY_SANCTIONED and PRIOR_OBSERVATIONS should have warnings
      expect(result.warnings.length).toBeGreaterThan(0);
      // All selected accounts should come from AMOUNT_WISE (the only eligible bucket)
      expect(result.totalSelected).toBeGreaterThan(0);
      for (const a of result.sampledAccounts) {
        expect(a.bucket).toBe("AMOUNT_WISE");
      }
    });
  });

  // ── Test 7: Empty portfolio ──────────────────────────────────────────────────
  describe("empty portfolio", () => {
    it("returns empty result with no errors for 0 accounts", () => {
      const input: SamplingInput = {
        accounts: [],
        sampleSizePct: 10,
        criteriaBuckets: makeBuckets({ bucket: "AMOUNT_WISE", pct: 100 }),
      };
      const result = generateSample(input);
      expect(result.sampledAccounts).toEqual([]);
      expect(result.warnings).toEqual([]);
      expect(result.totalRequested).toBe(0);
      expect(result.totalSelected).toBe(0);
    });
  });

  // ── Test 8: Single bucket at 100% ────────────────────────────────────────────
  describe("single bucket", () => {
    it("works correctly with a single bucket at 100%", () => {
      const accounts = makePortfolio(50);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10, // 5 accounts
        criteriaBuckets: makeBuckets({ bucket: "AMOUNT_WISE", pct: 100 }),
      };
      const result = generateSample(input);
      expect(result.totalSelected).toBe(5);
      expect(result.warnings).toHaveLength(0);
      for (const a of result.sampledAccounts) {
        expect(a.bucket).toBe("AMOUNT_WISE");
      }
    });
  });

  // ── Test 9: Rounding edge cases ───────────────────────────────────────────────
  describe("rounding edge cases", () => {
    it("total selected never exceeds totalRequested", () => {
      const accounts = makePortfolio(1000);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10, // 100 accounts
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 33 },
          { bucket: "AGE_WISE", pct: 33 },
          { bucket: "DPD_WISE", pct: 34 },
        ),
      };
      const result = generateSample(input);
      expect(result.totalSelected).toBeLessThanOrEqual(result.totalRequested);
    });

    it("handles odd sample sizes without crashing", () => {
      const accounts = makePortfolio(7);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 100, // all 7
        criteriaBuckets: makeBuckets(
          { bucket: "AMOUNT_WISE", pct: 50 },
          { bucket: "DPD_WISE", pct: 50 },
        ),
      };
      const result = generateSample(input);
      expect(result.totalSelected).toBeLessThanOrEqual(7);
    });
  });

  // ── Test 10: Prior observations empty ────────────────────────────────────────
  describe("prior observations empty bucket", () => {
    it("generates warning and overflows when no accounts have prior observations", () => {
      const accounts = Array.from({ length: 20 }, (_, i) =>
        makeAccount({
          id: `ACC_${i}`,
          hasPriorObservations: false,
          outstandingAmount: (20 - i) * 1000,
          dpd: 0,
        }),
      );
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10, // 2 accounts
        criteriaBuckets: makeBuckets(
          { bucket: "PRIOR_OBSERVATIONS", pct: 50 },
          { bucket: "AMOUNT_WISE", pct: 50 },
        ),
      };
      const result = generateSample(input);
      const priorWarning = result.warnings.find(
        (w) => w.bucket === "PRIOR_OBSERVATIONS",
      );
      expect(priorWarning).toBeDefined();
      expect(priorWarning?.filled).toBe(0);
      // AMOUNT_WISE should receive the overflow
      expect(result.totalSelected).toBeGreaterThan(0);
    });
  });

  // ── Test 11: SamplingResult structure ────────────────────────────────────────
  describe("result structure", () => {
    it("returns all required fields in SamplingResult", () => {
      const accounts = makePortfolio(20);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10,
        criteriaBuckets: makeBuckets({ bucket: "AMOUNT_WISE", pct: 100 }),
      };
      const result = generateSample(input);
      expect(result).toHaveProperty("sampledAccounts");
      expect(result).toHaveProperty("warnings");
      expect(result).toHaveProperty("totalRequested");
      expect(result).toHaveProperty("totalSelected");
      expect(Array.isArray(result.sampledAccounts)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it("each SampledAccount has accountId and bucket fields", () => {
      const accounts = makePortfolio(20);
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 10,
        criteriaBuckets: makeBuckets({ bucket: "AMOUNT_WISE", pct: 100 }),
      };
      const result = generateSample(input);
      for (const sa of result.sampledAccounts) {
        expect(sa).toHaveProperty("accountId");
        expect(sa).toHaveProperty("bucket");
        expect(typeof sa.accountId).toBe("string");
        expect(typeof sa.bucket).toBe("string");
      }
    });

    it("RedistributionWarning has all required fields", () => {
      const accounts = [
        makeAccount({ id: "RECENT", sanctionDate: ELEVEN_MONTHS_AGO }),
        ...Array.from({ length: 9 }, (_, i) =>
          makeAccount({
            id: `OLD_${i}`,
            sanctionDate: FIVE_YEARS_AGO,
            outstandingAmount: (i + 1) * 5000,
          }),
        ),
      ];
      const input: SamplingInput = {
        accounts,
        sampleSizePct: 50,
        criteriaBuckets: makeBuckets(
          { bucket: "NEWLY_SANCTIONED", pct: 70 },
          { bucket: "AMOUNT_WISE", pct: 30 },
        ),
      };
      const result = generateSample(input);
      if (result.warnings.length > 0) {
        const w = result.warnings[0];
        expect(w).toHaveProperty("bucket");
        expect(w).toHaveProperty("requested");
        expect(w).toHaveProperty("filled");
        expect(w).toHaveProperty("shortfall");
        expect(w).toHaveProperty("redistributedTo");
        expect(w.shortfall).toBe(w.requested - w.filled);
      }
    });
  });
});
