export type IndexComponentInput = {
  weight: number;    // fraction of b for this index (all weights must sum to 1)
  baseValue: number; // Index_0
  currentValue: number; // Index_n (provisional or definitive)
};

/**
 * Computes the revision amount for a billing period.
 *
 * Formula: revision = P0 × b × Σ_i( w_i × (I_n_i − I_0_i) / I_0_i )
 *
 * Returns 0 when all indices are equal to their base values.
 * Can be negative when indices fell below base.
 */
export function computeRevisionAmount(
  p0Cents: bigint,
  a: number,
  b: number,
  components: IndexComponentInput[]
): bigint {
  if (components.length === 0) return BigInt(0);
  const variableFactor = components.reduce(
    (sum, c) => sum + c.weight * ((c.currentValue - c.baseValue) / c.baseValue),
    0
  );
  return BigInt(Math.round(Number(p0Cents) * b * variableFactor));
}

/**
 * Delta catch-up for a single index component when the definitive value is published.
 *
 * Formula: delta_i = P0 × b × w_i × (definitive_i − provisional_i) / I_0_i
 */
export function computeRegularizationDelta(
  p0Cents: bigint,
  b: number,
  weight: number,
  baseValue: number,
  definitiveValue: number,
  provisionalValue: number
): bigint {
  const delta = Number(p0Cents) * b * weight * ((definitiveValue - provisionalValue) / baseValue);
  return BigInt(Math.round(delta));
}
