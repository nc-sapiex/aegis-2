import { z } from "zod";

// ─── Bucket Enum ──────────────────────────────────────────────────────────────

const BucketEnum = z.enum([
  "NEWLY_SANCTIONED",
  "AMOUNT_WISE",
  "AGE_WISE",
  "DPD_WISE",
  "PRIOR_OBSERVATIONS",
]);

// ─── Bucket Allocation Schema ────────────────────────────────────────────────

const BucketAllocationSchema = z.object({
  bucket: BucketEnum,
  pct: z.number().min(0).max(100),
  description: z.string(),
});

// ─── Save Criteria Schema ─────────────────────────────────────────────────────

/**
 * Validates the input for saving/updating sampling criteria.
 * Enforces that all 5 bucket allocations sum to exactly 100%.
 */
export const SaveCriteriaSchema = z.object({
  engagementId: z.string().uuid(),
  moduleCode: z.string().min(1),
  sampleSizePct: z.number().min(1).max(100),
  criteriaBuckets: z
    .array(BucketAllocationSchema)
    .length(5)
    .refine(
      (buckets) => {
        const sum = buckets.reduce((acc, b) => acc + b.pct, 0);
        return Math.abs(sum - 100) < 0.01;
      },
      { message: "Bucket allocations must sum to 100%" },
    ),
});

// ─── Generate Sample Schema ───────────────────────────────────────────────────

/**
 * Validates the input for triggering sample generation.
 * Requires engagementId and moduleCode to look up the saved criteria.
 */
export const GenerateSampleSchema = z.object({
  engagementId: z.string().uuid(),
  moduleCode: z.string().min(1),
});

// ─── Inferred Types ───────────────────────────────────────────────────────────

export type SaveCriteriaInput = z.infer<typeof SaveCriteriaSchema>;
export type GenerateSampleInput = z.infer<typeof GenerateSampleSchema>;
