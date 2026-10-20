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
import { createHash } from 'node:crypto'
import {
  createComposition,
  createEditorDocumentFromImage,
  createDocumentRenderScene,
  createCardShadowOptions,
  resolveCompositionLayout,
} from '@cute-screen/editor-core'
import { Canvas2DRenderer } from '@cute-screen/editor-renderer'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'
import type { CanvasKitImage } from '../../../packages/editor-renderer/src/backends/canvaskit/contracts'
import { CanvasKitTypefaceStore } from '../../../packages/editor-renderer/src/backends/canvaskit/geometry'
import { renderCanvasKitPng } from '../../../packages/editor-renderer/src/backends/canvaskit/scene'
import {
  canvasKit,
  canvasKitFonts,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'

beforeAll(prepareGoldenRuntime)
describe('connected screenshot shadow', () => {
  it.each([1, 2])('keeps the rounded screenshot shadow connected in decoded %ix PNG at scale 0.99', async (scale) => {
    const original = await readFile('tests/fixtures/generated/ui-4k.png')
    const hash = createHash('sha256').update(original).digest('hex')
    const image = await loadImage(original)
    const doc = createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000',
      baseLayerId: '019c1f62-058e-7000-8000-000000000001', timestamp: '2026-10-20T00:00:00Z',
      source: { blobHash: hash, format: 'png', mimeType: 'image/png', provenance: 'fileOpen',
        width: image.width, height: image.height, orientationApplied: true,
        color: { colorSpace: 'srgb', hasIccProfile: false } } })
    const start = createComposition('padding')
    const composition = { ...start, radius: 38, shadow: 0.83,
      layout: { ...start.layout, mode: 'fixed' as const, width: 1600, height: 1000, scale: 0.99 },
      background: { ...start.background, kind: 'solid' as const, color: { red: 0.5, green: 0.3, blue: 0.9, alpha: 1 } } }
    const document = { ...doc, presentation: { ...doc.presentation, composition } }
    const layout = resolveCompositionLayout(document)
    const kit = canvasKit as typeof canvasKit & { MakeImageFromEncoded(bytes: Uint8Array): CanvasKitImage | null }
    const nativeImage = kit.MakeImageFromEncoded(original)!
    const typefaces = new CanvasKitTypefaceStore(canvasKit, canvasKitFonts)
    const resources = new Map([[hash, { id: hash, width: image.width, height: image.height,
      image: nativeImage, source: image as unknown as HTMLImageElement, dispose: () => {} }]])
    const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
    await renderer.initialize({ scene: createCanvas(1, 1) as unknown as HTMLCanvasElement,
      overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'connected-shadow' })
    await renderer.createImageResource({ id: hash, width: image.width, height: image.height,
      source: image as unknown as HTMLImageElement })
    try {
      for (const backend of ['canvas2d', 'canvaskit'] as const) {
        const outputs: Uint8Array[] = []
        for (const shadow of [0, composition.shadow]) {
          const scene = createDocumentRenderScene({ ...document, presentation: { ...document.presentation,
            composition: { ...composition, shadow } } })
          renderer.setScene(scene)
          const bytes = backend === 'canvas2d' ? await renderer.exportPng({ scale })
            : renderCanvasKitPng(canvasKit, scene, resources, typefaces, { scale })
          const decoded = await loadImage(bytes)
          expect([decoded.width, decoded.height]).toEqual([1600 * scale, 1000 * scale])
          outputs.push(await rgba(bytes))
          if (scale === 1) {
            await mkdir('artifacts/appearance-compact', { recursive: true })
            await writeFile(`artifacts/appearance-compact/shadow-${backend}-${shadow === 0 ? 'off' : 'on'}.png`, bytes)
          }
        }
        const x = Math.round((layout.frame.x + layout.frame.width / 2) * scale)
        const sample = (distance: number) => {
          const y = Math.ceil((layout.frame.y + layout.frame.height + distance) * scale)
          const index = (y * 1600 * scale + x) * 4
          return outputs[0]![index]! - outputs[1]![index]!
        }
        expect(sample(1), `${backend}: attached shadow immediately below the screenshot`).toBeGreaterThan(8)
        expect(sample(1)).toBeGreaterThanOrEqual(sample(8))
        expect(sample(8)).toBeGreaterThanOrEqual(sample(16))
        expect(sample(32), `${backend}: soft ambient tail`).toBeGreaterThan(0)
        expect(sample(96)).toBe(0)
        const transparentScene = createDocumentRenderScene({ ...document,
          layers: document.layers.map((layer) => ({ ...layer, opacity: 0 })) })
        renderer.setScene(transparentScene)
        const transparent = backend === 'canvas2d' ? await renderer.exportPng({ scale })
          : renderCanvasKitPng(canvasKit, transparentScene, resources, typefaces, { scale })
        const pixels = await rgba(transparent)
        const centerY = Math.round((layout.frame.y + layout.frame.height / 2) * scale)
        const center = (centerY * 1600 * scale + x) * 4
        expect(Math.abs(pixels[center]! - Math.round(composition.background.color.red * 255)),
          `${backend}: no shadow inside transparent content`).toBeLessThanOrEqual(1)
        if (scale === 1) {
          const largeScene = createDocumentRenderScene({ ...document, presentation: { ...document.presentation,
            composition: { ...composition, shadowOptions: { ...createCardShadowOptions(), size: 4, spread: 12 } } } })
          renderer.setScene(largeScene)
          const large = backend === 'canvas2d' ? await renderer.exportPng({ scale })
            : renderCanvasKitPng(canvasKit, largeScene, resources, typefaces, { scale })
          await writeFile(`artifacts/appearance-compact/shadow-${backend}-large.png`, large)
          const enlarged = await rgba(large)
          const farY = Math.ceil(layout.frame.y + layout.frame.height + 64)
          const point = (farY * 1600 + x) * 4
          expect(outputs[1]![point]! - enlarged[point]!, `${backend}: 400% shadow extends farther`).toBeGreaterThan(4)
        }
      }
    } finally {
      renderer.dispose()
      typefaces.dispose()
      nativeImage.delete()
    }
    expect(createHash('sha256').update(await readFile('tests/fixtures/generated/ui-4k.png')).digest('hex')).toBe(hash)
  }, 90000)
})
