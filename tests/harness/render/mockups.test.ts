import {
  beforeAll,
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
  resolveCompositionLayout,
  phoneCamera,
  PHONE_MODELS,
  type CardFrame,
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
import {
  compareRgba,
  compositionCanvas2dTolerance,
} from './golden'

beforeAll(prepareGoldenRuntime)

function variants(): Array<{ name: string; frame: Partial<CardFrame> }> {
  return [
    ...PHONE_MODELS.flatMap((model, index) => (['portrait', 'landscape'] as const).map((orientation) => ({
      name: `${model.id}-${orientation}`,
      frame: { kind: 'phone' as const, phoneModel: model.id, orientation, phoneSystemDetails: true,
        phoneContentMode: (orientation === 'portrait') === (index % 2 === 0) ? 'safe' as const : 'fullscreen' as const,
        theme: index % 2 === 0 ? 'dark' as const : 'light' as const },
    }))),
    ...(['retro-windows', 'retro-mac'] as const).flatMap((browserStyle) => (['dark', 'light'] as const).map((theme) => ({
      name: `${browserStyle}-${theme}`, frame: { kind: 'browser' as const, browserStyle, theme,
        title: 'Cute Screen · Публикация — a deliberately long page title for truncation',
        url: 'https://example.test/публикация/a-long-path?preview=1&language=ru' },
    }))),
  ]
}

it.each([1, 2])('decodes production-like mockups through both backends at %ix', async (scale) => {
  const original = await readFile('tests/fixtures/generated/ui-4k.png')
  const hash = createHash('sha256').update(original).digest('hex')
  const image = await loadImage(original)
  const document = createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000',
    baseLayerId: '019c1f62-058e-7000-8000-000000000001', timestamp: '2026-10-30T00:00:00Z',
    source: { blobHash: hash, format: 'png', mimeType: 'image/png', provenance: 'fileOpen',
      width: image.width, height: image.height, orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
  const kit = canvasKit as typeof canvasKit & { MakeImageFromEncoded(bytes: Uint8Array): CanvasKitImage | null }
  const native = kit.MakeImageFromEncoded(original)!
  const fonts = new CanvasKitTypefaceStore(canvasKit, canvasKitFonts)
  const preview = createCanvas(1, 1)
  const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike,
    resolveFontFamily: () => ['Roboto cyrillic', 'Roboto latin'] })
  await renderer.initialize({ scene: preview as unknown as HTMLCanvasElement,
    overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'mockups' })
  await renderer.createImageResource({ id: hash, width: image.width, height: image.height,
    source: image as unknown as HTMLImageElement })
  try {
    await mkdir('artifacts/mockups', { recursive: true })
    for (const variant of variants()) {
      const base = createComposition('phone')
      const portrait = variant.frame.kind === 'phone' && variant.frame.orientation === 'portrait'
      const composition = { ...base, frame: { ...base.frame, ...variant.frame },
        layout: { ...base.layout, mode: 'fixed' as const, width: portrait ? 640 : 960, height: portrait ? 960 : 640 } }
      const doc = { ...document, crop: portrait ? { x: 600, y: 100, width: 1080, height: 1920 } : null,
        presentation: { ...document.presentation, composition } }
      const before = JSON.stringify(doc)
      const scene = createDocumentRenderScene(doc)
      renderer.setScene(scene)
      renderer.render(['scene'])
      const a = await renderer.exportPng({ scale })
      const b = renderCanvasKitPng(canvasKit, scene, new Map([[hash, { id: hash,
        width: image.width, height: image.height, image: native, source: image as unknown as HTMLImageElement,
        dispose: () => {} }]]), fonts, { scale })
      for (const [backend, bytes] of [['canvas2d', a], ['canvaskit', b]] as const) {
        const decoded = await loadImage(bytes)
        expect([decoded.width, decoded.height])
          .toEqual([composition.layout.width * scale, composition.layout.height * scale])
        await assertGolden(`mockup-${variant.name}-${backend}-${scale}`, bytes,
          backend === 'canvas2d' ? compositionCanvas2dTolerance : undefined)
        if (scale === 1 && backend === 'canvas2d') await writeFile(`artifacts/mockups/${variant.name}.png`, bytes)
        if (composition.frame.kind === 'phone') {
          const screen = resolveCompositionLayout(doc).screen
          const camera = phoneCamera(composition.frame, screen)
          const canvas = createCanvas(decoded.width, decoded.height)
          const context = canvas.getContext('2d')
          context.drawImage(decoded, 0, 0)
          const pixel = context.getImageData(Math.floor((camera.x + camera.width / 2) * scale),
            Math.floor((camera.y + camera.height / 2) * scale), 1, 1).data
          expect(Math.max(pixel[0]!, pixel[1]!, pixel[2]!)).toBeLessThan(100)
          expect(pixel[3]).toBe(255)
          if (composition.frame.phoneModel === 'iphone-notch') {
            const inset = Math.max(1.5, Math.min(camera.width, camera.height) * 0.06)
            const joined = { x: Math.max(camera.x, screen.x) + inset, y: Math.max(camera.y, screen.y) + inset }
            const other = composition.frame.orientation === 'portrait'
              ? { ...joined, x: camera.x + camera.width - inset }
              : { ...joined, y: camera.y + camera.height - inset }
            for (const point of [joined, other]) {
              const attachment = context.getImageData(Math.floor(point.x * scale),
                Math.floor(point.y * scale), 1, 1).data
              expect(Math.max(attachment[0]!, attachment[1]!, attachment[2]!)).toBeLessThan(20)
              expect(attachment[3]).toBe(255)
            }
          }
        }
      }
      const pixels = await rgba(a)
      expect(compareRgba(pixels, await rgba(b), 32).changedChannels / pixels.length).toBeLessThan(0.035)
      if (scale === 1) expect(compareRgba(pixels, await rgba(await preview.encode('png'))).changedChannels).toBe(0)
      expect(JSON.stringify(doc)).toBe(before)
    }
  } finally {
    renderer.dispose()
    fonts.dispose()
    native.delete()
  }
  expect(createHash('sha256').update(await readFile('tests/fixtures/generated/ui-4k.png')).digest('hex')).toBe(hash)
}, 120000)
