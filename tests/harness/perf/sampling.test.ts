import { setImmediate } from 'node:timers/promises'
import {
  afterEach,
  expect,
  it,
  vi,
} from 'vitest'
import {
  measureScenario,
  performanceSampling,
} from './metrics'

const scenario = {
  name: 'sampler-contract',
  fixtureSha256: 'a'.repeat(64),
  width: 7680,
  height: 4320,
  nodeCount: 1000,
  runner: 'sampler self-test',
}

afterEach(() => vi.restoreAllMocks())

it('keeps smoke short and reserves 30/120 for explicit software trends', () => {
  expect(performanceSampling('test')).toEqual({ profile: 'smoke', warmups: 2, measurements: 8, maxDurationMs: 30_000 })
  expect(performanceSampling('perf-trend')).toEqual({ profile: 'trend', warmups: 30, measurements: 120, maxDurationMs: 120_000 })
})

it('reports the actual sampling profile and native memory diagnostics', async () => {
  const render = vi.fn(() => 3)
  const report = await measureScenario(scenario, render, 0)
  const sampling = performanceSampling()
  expect(render).toHaveBeenCalledTimes(sampling.warmups + sampling.measurements)
  expect(report).toMatchObject({ ...sampling, p50: 3, p95: 3, max: 3, idleFrameCount: 0 })
  expect(report.memory.before.rss).toBeGreaterThan(0)
  expect(report.memory.afterWarmups.rss).toBeGreaterThan(0)
  expect(report.memory.afterMeasurements.rss).toBeGreaterThan(0)
  expect(report.memory.sampledPeakRss).toBeGreaterThanOrEqual(report.memory.afterMeasurements.rss)
})

it('yields between synchronous native frames', async () => {
  let eventLoopProgress = false
  const progress = setImmediate().then(() => {
    eventLoopProgress = true
  })
  let frames = 0
  await measureScenario(scenario, () => {
    if (frames++ > 0) expect(eventLoopProgress).toBe(true)
    return 1
  }, 0)
  await progress
})

it('stops after a slow frame instead of doing the remaining 149 redraws', async () => {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const render = vi.fn(() => {
    now += performanceSampling().maxDurationMs + 1
    return now
  })
  await expect(measureScenario(scenario, render, 0)).rejects.toThrow(/sampler-contract.*time budget.*warmup 1/)
  expect(render).toHaveBeenCalledTimes(1)
})

it('shares one deadline across warmups and measurements', async () => {
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  const sampling = performanceSampling()
  const render = vi.fn(async () => {
    const duration = sampling.maxDurationMs / (sampling.warmups + 1) + 1
    now += duration
    return duration
  })
  await expect(measureScenario(scenario, render, 0)).rejects.toThrow(/time budget.*measurement 1/)
  expect(render).toHaveBeenCalledTimes(sampling.warmups + 1)
})

it.each([NaN, Infinity, -1])('rejects invalid frame duration %s', async (duration) => {
  await expect(measureScenario(scenario, () => duration, 0)).rejects.toThrow('Invalid frame duration')
})

it('rejects idle frames before rendering', async () => {
  const render = vi.fn(() => 1)
  await expect(measureScenario(scenario, render, 1)).rejects.toThrow('Idle renderer scheduled 1 unexpected frames')
  expect(render).not.toHaveBeenCalled()
})
