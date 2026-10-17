import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import {
  createDrawingLayer,
  createDocumentRenderScene,
  DEFAULT_DRAWING_DEFAULTS,
} from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import {
  canvasKit,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'
import {
  compareRgba,
  semanticParityTolerance,
} from './golden'
import { baseDocument } from '../../../packages/editor-core/src/precision-tools.test-kit'

beforeAll(prepareGoldenRuntime)
describe('compound ink decoded export', () => {
  it.each([1, 2] as const)('matches preview and both backends at scale %i without alpha seams', async (scale) => {
    const layers = ['pen', 'stabilized', 'brush', 'marker'].map((brush, row) => {
      const points = [
        { x: 20, y: 20 + row * 70, pressure: .4 },
        { x: 40, y: 35 + row * 70, pressure: .5 },
        { x: 100, y: 35 + row * 70, pressure: .8 },
        { x: 180, y: 35 + row * 70, pressure: .9 },
        { x: 210, y: 50 + row * 70, pressure: .6 },
      ].map((p) => ({ ...p, x: p.x * scale, y: p.y * scale }))
      return createDrawingLayer({ id: `compound-${row}`, tool: brush === 'marker' ? 'marker' : 'pencil',
        start: points[0]!, end: points.at(-1)!, points, straightSegments: [{ start: 1, end: 3 }],
        defaults: { ...DEFAULT_DRAWING_DEFAULTS,
          pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil, brush, smoothing: 1, width: 10 * scale,
            pressureMode: 'pen', layerOpacity: .5 },
          marker: { ...DEFAULT_DRAWING_DEFAULTS.marker, width: 14 * scale },
        } })!
    })
    const scene = createDocumentRenderScene({
      ...baseDocument(), canvas: { width: 240 * scale, height: 290 * scale }, layers,
    })
    expect(scene.nodes).toHaveLength(4)
    const fallback = await canvas2dPngs(scene, scale)
    const skia = renderHeadlessCanvasKitPng(canvasKit, scene)
    const decoded = await rgba(fallback.exported)
    expect(compareRgba(await rgba(fallback.preview), decoded)).toEqual({ changedChannels: 0, maximumDelta: 0 })
    const other = await rgba(skia)
    const significant = other.reduce((sum, channel, index) =>
      sum + (Math.abs(channel - decoded[index]!) > 2 ? 1 : 0), 0)
    expect(significant / decoded.length).toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
    for (const x of [40, 100, 150]) {
      const alpha = decoded[((35 * scale) * scene.width + x * scale) * 4 + 3]!
      expect(alpha).toBeGreaterThanOrEqual(126)
      expect(alpha).toBeLessThanOrEqual(129)
    }
    await mkdir('artifacts/straight-strokes', { recursive: true })
    await writeFile(`artifacts/straight-strokes/ink-${scale}-canvas2d.png`, fallback.exported)
    await writeFile(`artifacts/straight-strokes/ink-${scale}-canvaskit.png`, skia)
  })
})
