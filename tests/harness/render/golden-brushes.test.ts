import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  createDocumentRenderScene,
  DEFAULT_DRAWING_DEFAULTS,
  type PencilLayer,
} from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import {
  canvasKit,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import {
  assertGolden,
  rgba,
} from './golden-assertion-test-kit'
import {
  compareRgba,
  semanticParityTolerance,
} from './golden'
import { baseDocument } from '../../../packages/editor-core/src/precision-tools.test-kit'

beforeAll(prepareGoldenRuntime)
describe('distinct brush decoded render parity', () => {
  it.each([1, 2] as const)('renders all brushes and legacy ink with single-pass alpha at scale %i', async (scale) => {
    const layers: PencilLayer[] = []
    for (const [index, brush] of ['pen', 'stabilized', 'brush', 'pencil'].entries()) {
      const points = Array.from({ length: 140 }, (_, i) => ({
        x: (25 + i * 2.5) * scale,
        y: (35 + index * 90 + Math.sin(i / 7) * 20 + (i % 2 ? 2 : -2)) * scale,
        pressure: .2 + .8 * i / 139,
      }))
      const defaults = { brush, color: { red: .8, green: .15, blue: .3, alpha: 1 },
        smoothing: .65, width: 10 * scale,
        ...(brush === 'pencil' ? {} : { strokeVersion: 2, pressureMode: 'pen' }) }
      const stroke = createDrawingLayer({ id: `brush-${index}`, tool: 'pencil',
        start: points[0]!, end: points.at(-1)!, points,
        defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: defaults } }) as PencilLayer
      layers.push({ ...stroke, opacity: .5 })
    }
    // Retracing and crossing a stroke must not composite its alpha per segment.
    layers.push(createDrawingLayer({ id: 'crossing', tool: 'pencil',
      start: { x: 25 * scale, y: 400 * scale }, end: { x: 145 * scale, y: 400 * scale },
      points: [{ x: 25 * scale, y: 400 * scale }, { x: 145 * scale, y: 400 * scale },
        { x: 85 * scale, y: 400 * scale }, { x: 85 * scale, y: 370 * scale }],
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil,
        brush: 'pen', width: 10 * scale, layerOpacity: .5 } } }) as PencilLayer)
    const scene = createDocumentRenderScene({
      ...baseDocument(), canvas: { width: 400 * scale, height: 425 * scale }, layers,
    })
    const fallback = await canvas2dPngs(scene, scale)
    const skia = renderHeadlessCanvasKitPng(canvasKit, scene)
    await assertGolden(`brushes-${scale}-canvas2d`, fallback.exported)
    await assertGolden(`brushes-${scale}-canvaskit`, skia)
    const decoded = await rgba(fallback.exported)
    expect(compareRgba(await rgba(fallback.preview), decoded)).toEqual({ changedChannels: 0, maximumDelta: 0 })
    const alpha = decoded[(400 * scale * scene.width + 85 * scale) * 4 + 3]!
    expect(alpha).toBeGreaterThanOrEqual(126)
    expect(alpha).toBeLessThanOrEqual(129)
    const skiaDecoded = await rgba(skia)
    // Skia and Canvas2D round 50% alpha to adjacent integers. Only differences
    // above two levels count toward the existing semantic parity threshold.
    const significantChannels = skiaDecoded.reduce((sum, channel, index) =>
      sum + (Math.abs(channel - decoded[index]!) > 2 ? 1 : 0), 0)
    expect(significantChannels / (scene.width * scene.height * 4))
      .toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
  })
})
