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

export interface PerformanceScenario {
  readonly name: string
  readonly fixtureSha256: string
  readonly width: number
  readonly height: number
  readonly nodeCount: number
  readonly runner: string
  readonly warmups?: number
  readonly measurements?: number
}

export interface PerformanceReport extends PerformanceScenario {
  readonly warmups: number
  readonly measurements: number
  readonly p50: number
  readonly p95: number
  readonly max: number
  readonly idleFrameCount: number
}

export function measureScenario(
  scenario: PerformanceScenario,
  render: () => number,
  idleFrameCount: number,
): PerformanceReport {
  const warmups = scenario.warmups ?? 30
  const measurements = scenario.measurements ?? 120
  if (warmups !== 30 || measurements !== 120) {
    throw new Error('M01 evidence requires 30 warmups and 120 measurements')
  }
  if (idleFrameCount !== 0) {
    throw new Error(
      `Idle renderer scheduled ${idleFrameCount} unexpected frames`,
    )
  }
  for (let index = 0; index < warmups; index += 1) render()
  const samples = Array.from({ length: measurements }, () => render())
  return {
    ...scenario,
    warmups,
    measurements,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: Math.max(...samples),
    idleFrameCount,
  }
}
