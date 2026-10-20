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
  parseEditorDocument,
  serializeEditorDocument,
  SHAPE_CATALOG,
} from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)
describe('shape paint exported appearance', () => {
  it('round-trips and decodes the complete catalogue with three stroke styles and multi-stop gradients', async () => {
    const layers = ['solid', 'dashed', 'dotted'].flatMap((style, row) => SHAPE_CATALOG.map((entry, i) => createDrawingLayer({
      id: `019c1f62-058e-7000-8000-${String(row * SHAPE_CATALOG.length + i + 1).padStart(12, '0')}`, tool: 'shape',
      start: { x: i % 7 * 144 + 18, y: (Math.floor(i / 7) + row * 5) * 128 + 18 },
      end: { x: i % 7 * 144 + 124, y: (Math.floor(i / 7) + row * 5) * 128 + 104 },
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, shape: {
        ...DEFAULT_DRAWING_DEFAULTS.shape, shape: entry.shape, cornerRadius: entry.cornerRadius ?? 0,
        stroke: { ...DEFAULT_DRAWING_DEFAULTS.shape.stroke as object, style, width: 4 },
        fill: { kind: 'linearGradient', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, opacity: 0.75, stops: [
          { position: 0, color: { red: 0.1, green: 0.8, blue: 0.7, alpha: 1 } },
          { position: 0.4, color: { red: 0.8, green: 0.2, blue: 0.6, alpha: 0.6 } },
          { position: 1, color: { red: 0.2, green: 0.4, blue: 0.9, alpha: 0 } },
        ] },
      } },
    })!))
    const parsed = parseEditorDocument(serializeEditorDocument({
      ...documentFixture, canvas: { width: 1024, height: 1920 }, layers,
    }))
    if (parsed.kind !== 'editable') throw new Error('expected editable shapes')
    const scene = createDocumentRenderScene(parsed.document)
    const fallback = await canvas2dPngs(scene, 1)
    const kit = renderHeadlessCanvasKitPng(canvasKit, scene)
    const a = await rgba(fallback.exported), b = await rgba(kit)
    expect(a.length).toBe(1024 * 1920 * 4)
    expect(compareRgba(a, await rgba(fallback.preview))).toEqual({ changedChannels: 0, maximumDelta: 0 })
    expect(compareRgba(a, b, 28).changedChannels / a.length).toBeLessThan(0.02)
    for (const pixels of [a, b]) for (let row = 0; row < 15; row++) {
      const region = pixels.slice(row * 128 * 1024 * 4, (row + 1) * 128 * 1024 * 4)
      expect(region.some((value, i) => i % 4 === 3 && value > 100)).toBe(true)
    }
    await mkdir('artifacts/shape-paint', { recursive: true })
    await writeFile('artifacts/shape-paint/catalogue-canvas2d.png', fallback.exported)
    await writeFile('artifacts/shape-paint/catalogue-canvaskit.png', kit)
  }, 30000)
  it('draws actual gaps and circular dots on basic closed contours in both backends', async () => {
    const counts: number[][] = []
    for (const style of ['solid', 'dashed', 'dotted']) {
      const layer = createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000001', tool: 'shape',
        start: { x: 20, y: 20 }, end: { x: 400, y: 180 },
        defaults: { ...DEFAULT_DRAWING_DEFAULTS, shape: { ...DEFAULT_DRAWING_DEFAULTS.shape,
          fill: { kind: 'none' }, stroke: { ...DEFAULT_DRAWING_DEFAULTS.shape.stroke as object, width: 8, style },
        } },
      })!
      const scene = createDocumentRenderScene({ ...documentFixture, layers: [layer] })
      const fallback = await canvas2dPngs(scene, 1)
      const images = [fallback.exported, renderHeadlessCanvasKitPng(canvasKit, scene)]
      const styleCounts = []
      for (const png of images) {
        const pixels = await rgba(png)
        let ink = 0
        for (let y = 0; y < 200; y++) for (let x = 0; x < 420; x++) if (pixels[(y * 800 + x) * 4 + 3]! > 128) ink++
        styleCounts.push(ink)
      }
      counts.push(styleCounts)
    }
    for (let backend = 0; backend < 2; backend++) {
      expect(counts[1]![backend]!).toBeLessThan(counts[0]![backend]! * 0.8)
      expect(counts[2]![backend]!).toBeGreaterThan(100)
      expect(counts[2]![backend]!).toBeLessThan(counts[1]![backend]!)
    }
  })
})
