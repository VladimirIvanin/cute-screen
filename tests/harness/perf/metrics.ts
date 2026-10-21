import { setImmediate } from 'node:timers/promises'

export function percentile(
  samples: readonly number[],
  quantile: number,
): number {
  if (samples.length === 0) throw new Error('At least one performance sample is required')
  if (quantile < 0 || quantile > 1) throw new Error('Quantile must be between 0 and 1')

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
}

export function performanceSampling(mode = import.meta.env.MODE) {
  return mode === 'perf-trend'
    ? { profile: 'trend' as const, warmups: 30, measurements: 120, maxDurationMs: 120_000 }
    : { profile: 'smoke' as const, warmups: 2, measurements: 8, maxDurationMs: 30_000 }
}

export interface PerformanceReport extends PerformanceScenario {
  readonly profile: 'smoke' | 'trend'
  readonly warmups: number
  readonly measurements: number
  readonly maxDurationMs: number
  readonly elapsedMs: number
  readonly p50: number
  readonly p95: number
  readonly max: number
  readonly idleFrameCount: number
  readonly memory: {
    readonly before: NodeJS.MemoryUsage
    readonly afterWarmups: NodeJS.MemoryUsage
    readonly afterMeasurements: NodeJS.MemoryUsage
    readonly sampledPeakRss: number
  }
}

export async function measureScenario(
  scenario: PerformanceScenario,
  render: () => number | Promise<number>,
  idleFrameCount: number,
): Promise<PerformanceReport> {
  const sampling = performanceSampling()
  const { warmups, measurements, maxDurationMs } = sampling
  if (idleFrameCount !== 0) {
    throw new Error(`Idle renderer scheduled ${idleFrameCount} unexpected frames`)
  }
  const started = performance.now()
  const before = process.memoryUsage()
  let sampledPeakRss = before.rss
  function checkDeadline(stage: string): void {
    if (performance.now() - started > maxDurationMs) {
      throw new Error(`${scenario.name}: software ${sampling.profile} time budget ${maxDurationMs} ms exceeded at ${stage}; RSS ${sampledPeakRss} bytes`)
    }
  }
  async function frame(stage: string): Promise<number> {
    checkDeadline(stage)
    const duration = await render()
    sampledPeakRss = Math.max(sampledPeakRss, process.memoryUsage.rss())
    checkDeadline(stage)
    if (!Number.isFinite(duration) || duration < 0) throw new Error(`Invalid frame duration: ${duration}`)
    // Native canvas work blocks timers and defers GC until the event loop can run.
    await setImmediate()
    checkDeadline(stage)
    return duration
  }
  for (let index = 0; index < warmups; index += 1) await frame(`warmup ${index + 1}`)
  const afterWarmups = process.memoryUsage()
  const samples: number[] = []
  for (let index = 0; index < measurements; index += 1) samples.push(await frame(`measurement ${index + 1}`))
  const afterMeasurements = process.memoryUsage()
  sampledPeakRss = Math.max(sampledPeakRss, afterMeasurements.rss)
  return {
    ...scenario,
    ...sampling,
    elapsedMs: performance.now() - started,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
    max: Math.max(...samples),
    idleFrameCount,
    memory: { before, afterWarmups, afterMeasurements, sampledPeakRss },
  }
}
