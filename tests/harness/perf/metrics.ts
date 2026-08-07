export function percentile(
  samples: readonly number[],
  quantile: number,
): number {
  if (samples.length === 0)
    throw new Error('At least one performance sample is required')
  if (quantile < 0 || quantile > 1)
    throw new Error('Quantile must be between 0 and 1')

  const ordered = [...samples].sort((left, right) => left - right)
  const index = Math.ceil(quantile * ordered.length) - 1
  return ordered[Math.max(0, index)]!
}
