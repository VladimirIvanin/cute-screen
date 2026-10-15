import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  SHAPE_CATALOG,
  createDrawingLayer,
  createDocumentRenderScene,
  DEFAULT_DRAWING_DEFAULTS,
  type ShapeLayer,
} from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import {
  assertGolden,
  rgba,
} from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)

function catalogueScene() {
  const layers = SHAPE_CATALOG.map((entry, i) => createDrawingLayer({
    id: `019c1f62-058e-7000-8000-${String(i + 1).padStart(12, '0')}`, tool: 'shape',
    start: { x: (i % 7) * 144 + 20, y: Math.floor(i / 7) * 144 + 20 },
    end: { x: (i % 7) * 144 + 120, y: Math.floor(i / 7) * 144 + 110 },
    defaults: { ...DEFAULT_DRAWING_DEFAULTS, shape: { ...DEFAULT_DRAWING_DEFAULTS.shape,
      shape: entry.shape, cornerRadius: entry.cornerRadius ?? 0, layerOpacity: i % 3 === 0 ? 0.5 : 1,
      fill: i % 3 === 1 ? { kind: 'none' } : i % 3 === 0 ? {
        kind: 'solid', opacity: 1, color: { red: 0.2, green: 0.5, blue: 0.9, alpha: 1 },
      }
        : { kind: 'linearGradient', opacity: 1, start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, stops: [
            { position: 0, color: { red: 0.1, green: 0.8, blue: 0.6, alpha: 1 } },
            { position: 1, color: { red: 0.7, green: 0.2, blue: 0.8, alpha: 1 } },
          ] },
    } },
  }) as ShapeLayer)
  return createDocumentRenderScene({ ...documentFixture, canvas: { width: 1024, height: 768 }, layers })
}

describe('expanded shape catalogue rendering', () => {
  for (const scale of [1, 2]) {
    it(`matches full-catalogue goldens and decodes exports at scale ${scale}`, async () => {
      const scene = catalogueScene()
      const fallback = await canvas2dPngs(scene, 1, scale)
      const accelerated = renderHeadlessCanvasKitPng(canvasKit, scene, [], { scale })
      await assertGolden(`shape-catalogue-scale-${scale}-canvas2d`, fallback.exported)
      await assertGolden(`shape-catalogue-scale-${scale}-canvaskit`, accelerated)
      if (scale === 1) {
        expect(compareRgba(await rgba(fallback.preview), await rgba(fallback.exported)))
          .toEqual({ changedChannels: 0, maximumDelta: 0 })
      }
      const a = await rgba(fallback.exported), b = await rgba(accelerated)
      expect(a.length).toBe(1024 * 768 * scale * scale * 4)
      // Edge antialiasing differs; the interior, contour location and detail lines must agree.
      const difference = compareRgba(a, b, 28)
      expect(difference.changedChannels / a.length).toBeLessThan(0.015)
      for (let i = 0; i < SHAPE_CATALOG.length; i++) {
        let ink = 0
        for (let y = (Math.floor(i / 7) * 144 + 10) * scale; y < (Math.floor(i / 7) * 144 + 130) * scale; y++) {
          for (let x = ((i % 7) * 144 + 10) * scale; x < ((i % 7) * 144 + 130) * scale; x++) {
            if (a[(y * 1024 * scale + x) * 4 + 3]! > 0) ink++
          }
        }
        expect(ink, SHAPE_CATALOG[i]!.id).toBeGreaterThan(80 * scale * scale)
      }
    }, 20000)
  }
  it('composites filled cylinder and its detail stroke at one layer opacity', async () => {
    const full = catalogueScene()
    const cylinder = full.nodes.find((node) => node.kind === 'vector' && node.details.length && node.id.endsWith('000000000007'))!
    const scene = { ...full, nodes: [{ ...cylinder, opacity: 0.5 }] }
    const fallback = await canvas2dPngs(scene, 1)
    for (const png of [fallback.exported, renderHeadlessCanvasKitPng(canvasKit, scene)]) {
      const pixels = await rgba(png)
      const alpha = pixels.filter((_value, i) => i % 4 === 3)
      expect(Math.max(...alpha.slice(0, 100000))).toBeGreaterThan(0)
      expect(alpha.every((value) => value <= 128)).toBe(true)
    }
  })
})
