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
  readFile,
  writeFile,
  mkdir,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  createComposition,
  createEditorDocumentFromImage,
  createDocumentRenderScene,
  createCardBranding,
  resolveBrandingYear,
  resolveCompositionLayout,
  type CompositionSettings,
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
import {
  assertGolden,
  rgba,
} from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)
describe('publication cards on production-like content', () => {
  it.each([1, 2])('decodes both renderer outputs at %ix and preserves source', async (scale) => {
    const original = await readFile('tests/fixtures/generated/ui-4k.png')
    const hash = createHash('sha256').update(original).digest('hex')
    const image = await loadImage(original)
    const doc = createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000',
      baseLayerId: '019c1f62-058e-7000-8000-000000000001', timestamp: '2026-10-20T00:00:00Z',
      source: { blobHash: hash, format: 'png', mimeType: 'image/png', provenance: 'fileOpen', width: image.width, height: image.height,
        orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
    const kit = canvasKit as typeof canvasKit & { MakeImageFromEncoded(bytes: Uint8Array): CanvasKitImage | null }
    const nativeImage = kit.MakeImageFromEncoded(original)!
    const typefaces = new CanvasKitTypefaceStore(canvasKit, canvasKitFonts)
    const preview = createCanvas(1, 1)
    const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike,
      resolveFontFamily: (text) => /[А-Яа-я]/u.test(text) ? ['Roboto cyrillic', 'Roboto latin'] : 'Roboto latin' })
    await renderer.initialize({ scene: preview as unknown as HTMLCanvasElement,
      overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'composition-golden' })
    await renderer.createImageResource({ id: hash,
      width: image.width,
      height: image.height,
      source: image as unknown as HTMLImageElement })
    try {
      for (const kind of ['browser', 'window', 'phone', 'footer', 'freeform'] as const) {
        const start = createComposition(kind === 'freeform' ? 'padding' : kind === 'window' ? 'browser' : kind)
        const branding = resolveBrandingYear({ ...createCardBranding('author', 2026),
          template: '© {year} Cute Screen', region: 'footer', fontSize: 18 }, 2026)
        const composition: CompositionSettings = { ...start,
          frame: { ...start.frame, kind: kind === 'window' ? 'window' : start.frame.kind, title: 'Cute Screen · Блог' },
          layout: { ...start.layout, mode: 'fixed', width: 960, height: 720 },
          footer: { ...start.footer, height: 56 }, branding: [branding],
          background: { ...start.background, kind: kind === 'freeform' ? 'freeform' : 'linear' } }
        const sceneDoc = { ...doc, presentation: { ...doc.presentation, composition } }
        const scene = createDocumentRenderScene(sceneDoc)
        const snapshot = JSON.stringify(sceneDoc)
        renderer.setScene(scene)
        renderer.render(['scene'])
        const fallback = await renderer.exportPng({ scale })
        const native = renderCanvasKitPng(canvasKit, scene, new Map([[hash, {
          id: hash, width: image.width, height: image.height, image: nativeImage,
          source: image as unknown as HTMLImageElement, dispose: () => {} }]]), typefaces, { scale })
        for (const [backend, bytes] of [['canvas2d', fallback], ['canvaskit', native]] as const) {
          const decoded = await loadImage(bytes)
          expect([decoded.width, decoded.height]).toEqual([960 * scale, 720 * scale])
          await assertGolden(`composition-${kind}-${backend}-${scale}`, bytes)
          await mkdir('artifacts/composition', { recursive: true })
          if (scale === 1) await writeFile(`artifacts/composition/${kind}-${backend}.png`, bytes)
        }
        const a = await rgba(fallback), b = await rgba(native)
        expect(compareRgba(a, b, 32).changedChannels / a.length).toBeLessThan(0.03)
        if (scale === 1) expect(compareRgba(a, await rgba(await preview.encode('png'))).changedChannels).toBe(0)
        expect(JSON.stringify(sceneDoc)).toBe(snapshot)
        const layout = resolveCompositionLayout(sceneDoc)
        expect(layout.content.width / layout.content.height).toBeCloseTo(image.width / image.height)
      }
    } finally {
      renderer.dispose()
      typefaces.dispose()
      nativeImage.delete()
    }
    expect(createHash('sha256').update(await readFile('tests/fixtures/generated/ui-4k.png')).digest('hex')).toBe(hash)
  }, 90000)
})
