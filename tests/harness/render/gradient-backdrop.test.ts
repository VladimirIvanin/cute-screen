import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  createDrawingLayer,
  createDocumentRenderScene,
  fitGradientLayer,
  gradientFrame,
  updateGradientHandle,
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
describe('gradient backdrop preview/export', () => {
  for (const scale of [1,
    2] as const) it(`decodes both backends and compares crop/alpha at scale ${scale}`,
    async () => {
      const document = { ...documentFixture,
        canvas: { width: 1024,
          height: 640 },
        crop: { x: 20,
          y: 30,
          width: 960,
          height: 560 },
        layers: [] }
      const created = createDrawingLayer({ id: 'gradient',
        tool: 'gradient',
        start: { x: 100,
          y: 250 },
        end: { x: 900,
          y: 590 } })!
      if (created.kind !== 'shape') throw new Error('Gradient must be a shape')
      const layer = fitGradientLayer(created, gradientFrame(document), 'width')
      const scene = createDocumentRenderScene({ ...document, layers: [layer] })
      expect(scene.nodes[0]).toMatchObject({ strokeWidth: 0, x: 20, width: 960 })
      const fallback = await canvas2dPngs(scene, 1, scale)
      const kit = renderHeadlessCanvasKitPng(canvasKit, scene, [], { scale })
      const decoded = await loadImage(kit)
      expect([decoded.width, decoded.height]).toEqual([960 * scale, 560 * scale])
      const a = await rgba(fallback.exported), b = await rgba(kit)
      expect(compareRgba(a, b, 4).changedChannels / a.length).toBeLessThan(.002)
      const alpha = (x: number, y: number) => a[((y * scale) * (960 * scale) + x * scale) * 4 + 3]!
      expect(alpha(400, 50)).toBe(0)
      expect(alpha(400, 300)).toBeGreaterThan(40)
      expect(alpha(400, 550)).toBeGreaterThan(240)
      if (scale === 1) expect(compareRgba(a, await rgba(fallback.preview))).toEqual(
        { changedChannels: 0, maximumDelta: 0 })
      const screenshot = await loadImage(await readFile(process.env.CUTE_SCREEN_GRADIENT_SOURCE ?? 'tests/fixtures/generated/ui-4k.png'))
      await mkdir('artifacts/gradient', { recursive: true })
      for (const [backend, png] of [['canvas2d', fallback.exported], ['canvaskit', kit]] as const) {
        const surface = createCanvas(decoded.width, decoded.height)
        const context = surface.getContext('2d')
        context.drawImage(screenshot, 0, 0, surface.width, surface.height)
        context.drawImage(await loadImage(png), 0, 0)
        await writeFile(`artifacts/gradient/render-${scale}-${backend}.png`, await surface.encode('png'))
      }
      const moved = updateGradientHandle(layer, 'line', { x: 0, y: -20 })
      expect(moved.localBounds).toEqual(layer.localBounds)
    }, 30000)
})
