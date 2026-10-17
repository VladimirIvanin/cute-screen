import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import {
  beginStroke,
  moveStroke,
  setStrokeStraight,
  resolveFreehandGeometry,
  DEFAULT_DRAWING_DEFAULTS,
} from '@cute-screen/editor-core'

describe('long compound stroke processing', () => {
  it.each([[3840, 2160], [7680, 4320]])('records 12000 samples at %i×%i', async (width, height) => {
    const started = performance.now()
    let state = beginStroke({ x: 20, y: height * .3, pressure: .5 }, false)
    for (let i = 1; i <= 12000; i++) {
      if (i % 3000 === 0) state = setStrokeStraight(state, state.straightStart === undefined)
      state = moveStroke(state, { x: 20 + i * width * .8 / 12000,
        y: height * .3 + Math.sin(i / 40) * 20, pressure: .2 + .8 * (i % 50) / 50 })
    }
    const inputMs = performance.now() - started
    const timings = []
    for (const brush of ['pen', 'stabilized', 'brush']) {
      const start = performance.now()
      const geometry = resolveFreehandGeometry({ ...DEFAULT_DRAWING_DEFAULTS.pencil, brush, strokeVersion: 3,
        points: state.points, straightSegments: state.straightSegments }, true)
      timings.push({ brush, geometryMs: performance.now() - start, points: geometry.points.length })
      expect(geometry.points.length).toBeGreaterThan(100)
      expect([...geometry.points, ...geometry.outline].every((p) => Number.isFinite(p.x + p.y))).toBe(true)
    }
    await mkdir('artifacts/straight-strokes', { recursive: true })
    await writeFile(`artifacts/straight-strokes/perf-${width}.json`, JSON.stringify({
      platform: `${process.platform}/${process.arch}`, width, height, rawSamples: 12000,
      storedSamples: state.points.length, inputMs, timings,
      note: 'CPU correctness and timing evidence, not a GPU frame budget',
    }, null, 2))
  }, 30000)
})
