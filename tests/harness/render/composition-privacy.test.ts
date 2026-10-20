import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import {
  describe,
  it,
  expect,
} from 'vitest'
import {
  createCensorLayer,
  createLoupeLayer,
  createComposition,
  createEditorDocumentFromImage,
  createDocumentRenderScene,
} from '@cute-screen/editor-core'
import { Canvas2DRenderer } from '@cute-screen/editor-renderer'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'
import { rgba } from './golden-assertion-test-kit'

describe('composition privacy', () => {
  it('samples censored content for blurred backgrounds and card loupes at export and thumbnail sizes', async () => {
    const bytes = await readFile('tests/fixtures/generated/ui-4k.png')
    const image = await loadImage(bytes)
    const other = createCanvas(image.width, image.height)
    other.getContext('2d').fillStyle = 'magenta'
    other.getContext('2d').fillRect(0, 0, image.width, image.height)
    const runtime = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
    await runtime.initialize({ scene: createCanvas(1, 1) as unknown as HTMLCanvasElement,
      overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'card-privacy' })
    const hash = 'a'.repeat(64)
    const initial = createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000',
      baseLayerId: '019c1f62-058e-7000-8000-000000000001', timestamp: '2026-10-20T00:00:00Z',
      source: { blobHash: hash, format: 'png', mimeType: 'image/png', provenance: 'fileOpen', width: image.width, height: image.height,
        orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
    const start = createComposition()
    const composition = { ...start, layout: { ...start.layout, mode: 'fixed' as const, width: 640, height: 480 },
      background: { ...start.background, kind: 'blurred' as const, blur: 24 } }
    const censor = createCensorLayer({ id: 'censor', region: { kind: 'rectangle', bounds: { x: 0, y: 0, ...initial.canvas } },
      effect: { mode: 'solid', color: { red: 0, green: 0, blue: 0, alpha: 1 } } })
    const loupe = { ...createLoupeLayer({ id: 'card-loupe', canvas: { width: 640, height: 480 },
      sourceRegion: { x: 250, y: 200, width: 40, height: 40 }, destination: { x: 30, y: 30 }, size: 100, zoom: 2.5 }), space: 'card' as const }
    const scene = createDocumentRenderScene({ ...initial, layers: [...initial.layers, censor, loupe],
      presentation: { ...initial.presentation, composition } })
    const outputs: Uint8Array[][] = []
    try {
      for (const source of [image, other]) {
        const resource = await runtime.createImageResource({ id: hash, width: image.width, height: image.height,
          source: source as unknown as HTMLImageElement })
        runtime.setScene(scene)
        outputs.push(await Promise.all([1, .25].map(async (scale) => rgba(await runtime.exportPng({ scale })))))
        resource.dispose()
      }
      expect(outputs[0]).toEqual(outputs[1])
      expect(outputs[0]![0]!.some((byte, index) => index % 4 === 3 && byte > 0)).toBe(true)
    } finally {
      runtime.dispose()
    }
  }, 60000)
})
