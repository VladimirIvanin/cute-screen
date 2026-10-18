import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  createDrawingLayer,
  createDocumentRenderScene,
  DEFAULT_DRAWING_DEFAULTS,
  parseEditorDocument,
  serializeEditorDocument,
  type ImageLayer,
} from '@cute-screen/editor-core'
import {
  Canvas2DRenderer,
  type Canvas2DLike,
} from '@cute-screen/editor-renderer'
import type {
  CanvasKitApi,
  CanvasKitImage,
} from '../../../packages/editor-renderer/src/backends/canvaskit/contracts'
import { renderCanvasKitPng } from '../../../packages/editor-renderer/src/backends/canvaskit/scene'
import { CanvasKitTypefaceStore } from '../../../packages/editor-renderer/src/backends/canvaskit/geometry'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)
describe('line export over production-like 4K UI', () => {
  it('decodes every direction and stroke style identically in preview/export with backend parity', async () => {
    const screenshot = await loadImage(await readFile('apps/landing/assets/hero-admin.png'))
    const backing = createCanvas(3840, 2160)
    const source = backing.getContext('2d')
    source.fillStyle = '#f4f5f7'
    source.fillRect(0, 0, 3840, 2160)
    const height = screenshot.height * 3840 / screenshot.width
    source.drawImage(screenshot, 0, (2160 - height) / 2, 3840, height)
    const bytes = new Uint8Array(await backing.encode('png'))
    const image = await loadImage(bytes)
    const base = documentFixture.layers[0] as ImageLayer
    const background: ImageLayer = { ...base, localBounds: { x: 0, y: 0, width: 3840, height: 2160 },
      transform: { ...base.transform, translateX: 0, translateY: 0 },
      payload: { ...base.payload, intrinsicWidth: 3840, intrinsicHeight: 2160,
        border: null, radius: 0, crop: null, mask: null },
    }
    const lines = ['solid', 'dashed', 'dotted'].flatMap((style, row) => [
      [{ x: 200, y: 250 + row * 550 }, { x: 1200, y: 250 + row * 550 }],
      [{ x: 1650, y: 100 + row * 550 }, { x: 1650, y: 500 + row * 550 }],
      [{ x: 2200, y: 100 + row * 550 }, { x: 3400, y: 500 + row * 550 }],
    ].map(([start, end], col) => createDrawingLayer({
      id: `019c1f62-058e-7000-8000-${String(20 + row * 3 + col).padStart(12, '0')}`, tool: 'line', start: start!, end: end!,
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, line: { ...DEFAULT_DRAWING_DEFAULTS.line,
        stroke: { ...DEFAULT_DRAWING_DEFAULTS.line.stroke as object, style, width: 6 } } },
    })!))
    const parsed = parseEditorDocument(serializeEditorDocument({ ...documentFixture,
      canvas: { width: 3840, height: 2160 }, layers: [background, ...lines] }))
    if (parsed.kind !== 'editable') throw new Error('line document must stay editable')
    const scene = createDocumentRenderScene(parsed.document)
    const target = createCanvas(3840, 2160)
    const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
    await renderer.initialize({ scene: target as unknown as HTMLCanvasElement,
      overlay: createCanvas(3840, 2160) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'line-4k' })
    await renderer.createImageResource({
      id: base.payload.blobHash, width: 3840, height: 2160, source: image as unknown as HTMLImageElement,
    })
    renderer.setScene(scene)
    renderer.render(['scene'])
    const preview = await target.encode('png')
    const exported = await renderer.exportPng()
    renderer.dispose()
    const nativeKit = canvasKit as CanvasKitApi & {
      MakeImageFromEncoded(bytes: Uint8Array): CanvasKitImage | null
    }
    const native = nativeKit.MakeImageFromEncoded(bytes)
    if (!native) throw new Error('4K fixture failed to decode in CanvasKit')
    const fonts = new CanvasKitTypefaceStore(canvasKit, [])
    let kit: Uint8Array
    try {
      kit = renderCanvasKitPng(canvasKit, scene, new Map([[base.payload.blobHash, {
        id: base.payload.blobHash, width: 3840, height: 2160, source: image as unknown as HTMLImageElement,
        image: native, dispose: () => native.delete(),
      }]]), fonts)
    } finally {
      fonts.dispose()
      native.delete()
    }
    const pixels = await rgba(exported)
    expect(compareRgba(pixels, await rgba(preview))).toEqual({ changedChannels: 0, maximumDelta: 0 })
    expect(compareRgba(pixels, await rgba(kit), 28).changedChannels / pixels.length).toBeLessThan(.002)
    const original = await rgba(bytes)
    for (const png of [exported, kit]) {
      const decoded = await rgba(png)
      expect(decoded).toHaveLength(3840 * 2160 * 4)
      for (let row = 0; row < 3; row++) {
        let changed = 0
        for (let x = 200; x < 1200; x++) {
          const i = ((250 + row * 550) * 3840 + x) * 4
          if (decoded[i]! > original[i]! + 30) changed++
        }
        expect(changed).toBeGreaterThan(50)
        if (row > 0) expect(changed).toBeLessThan(950)
      }
    }
    await mkdir('artifacts/line', { recursive: true })
    await writeFile('artifacts/line/4k-canvas2d.png', exported)
    await writeFile('artifacts/line/4k-canvaskit.png', kit)
  }, 30000)
})
