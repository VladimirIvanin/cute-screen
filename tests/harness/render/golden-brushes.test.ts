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
  CommandManager,
  createExpressiveBrushMigrationCommand,
  rebaseFreehandLayer,
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
  it('rounds sparse loops and S curves at constant width in preview and decoded export', async () => {
    const layers: PencilLayer[] = []
    for (const [column, brush] of ['pen', 'stabilized'].entries()) {
      const trajectories = [
        Array.from({ length: 20 }, (_, i) => {
          const angle = i / 19 * Math.PI * 2.1
          const radius = 25 + i * 3.4
          return { x: 170 + column * 400 + Math.cos(angle) * radius,
            y: 130 + Math.sin(angle) * radius, pressure: .5 }
        }),
        Array.from({ length: 25 }, (_, i) => ({
          x: 40 + column * 400 + i * 13,
          y: 320 + Math.sin(i / 24 * Math.PI * 2) * 65 + (i % 2 ? 2 : -2), pressure: .5,
        })),
      ]
      for (const [row, points] of trajectories.entries()) {
        layers.push(createDrawingLayer({ id: `rounded-${column}-${row}`, tool: 'pencil',
          start: points[0]!, end: points.at(-1)!, points,
          defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil,
            brush, width: 3, smoothing: .65, color: { red: .12, green: .12, blue: .12, alpha: 1 } } },
        }) as PencilLayer)
      }
    }
    const ink = createDocumentRenderScene({ ...baseDocument(), canvas: { width: 800, height: 430 }, layers })
    const scene = { ...ink, nodes: [{ kind: 'rect' as const, id: 'paper', x: 0, y: 0,
      width: 800, height: 430, rotation: 0, opacity: 1, visible: true,
      fill: { red: 1, green: 1, blue: 1, alpha: 1 } }, ...ink.nodes] }
    const fallback = await canvas2dPngs(scene, 1)
    const skia = renderHeadlessCanvasKitPng(canvasKit, scene)
    await assertGolden('rounded-ink-canvas2d', fallback.exported)
    await assertGolden('rounded-ink-canvaskit', skia)
    expect(compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)))
      .toEqual({ changedChannels: 0, maximumDelta: 0 })
    const decoded = await rgba(fallback.exported)
    const skiaDecoded = await rgba(skia)
    const significantChannels = skiaDecoded.reduce((sum, channel, index) =>
      sum + (Math.abs(channel - decoded[index]!) > 2 ? 1 : 0), 0)
    expect(significantChannels / decoded.length).toBeLessThanOrEqual(semanticParityTolerance.maximumChangedChannelRatio)
  })
  it('exports migrated 4K ink with the same decoded pixels as stabilized preview in both backends', async () => {
    const points = Array.from({ length: 1200 }, (_, i) => ({
      x: 100 + i * 2.8, y: 900 + Math.sin(i / 20) * 300 + i % 2 * 5, pressure: .2 + i % 9 / 12,
    }))
    const stroke = createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000091', tool: 'pencil',
      start: points[0]!, end: points.at(-1)!, points,
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil,
        brush: 'brush', width: 20, smoothing: .35, layerOpacity: .5 } },
    }) as PencilLayer
    const input = { ...baseDocument(), canvas: { width: 3840, height: 2160 }, layers: [stroke] }
    const manager = new CommandManager(input)
    const migrated = manager.execute(createExpressiveBrushMigrationCommand(manager.snapshot.document)!).document
    const expected = { ...input, layers: [rebaseFreehandLayer({ ...stroke,
      payload: { ...stroke.payload, brush: 'stabilized' },
    })] }
    const scene = createDocumentRenderScene(migrated)
    const fallback = await canvas2dPngs(scene, 1)
    const pixels = await rgba(fallback.exported)
    expect(pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
    expect(compareRgba(await rgba(fallback.preview), pixels)).toEqual({ changedChannels: 0, maximumDelta: 0 })
    const expectedScene = createDocumentRenderScene(expected)
    expect(compareRgba(await rgba((await canvas2dPngs(expectedScene, 1)).exported), pixels))
      .toEqual({ changedChannels: 0, maximumDelta: 0 })
    expect(compareRgba(await rgba(renderHeadlessCanvasKitPng(canvasKit, scene)),
      await rgba(renderHeadlessCanvasKitPng(canvasKit, expectedScene))))
      .toEqual({ changedChannels: 0, maximumDelta: 0 })
  })
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
