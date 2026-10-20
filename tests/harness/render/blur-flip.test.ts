import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { readFile } from 'node:fs/promises'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  applyEditorCommand,
  createCensorLayer,
  createComposition,
  createDocumentRenderScene,
  createEditorDocumentFromImage,
  createFlipCanvasCommand,
} from '@cute-screen/editor-core'
import { Canvas2DRenderer } from '@cute-screen/editor-renderer'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'
import { rgba } from './golden-assertion-test-kit'

describe('canvas reflection with cached blur', () => {
  it('matches a fresh renderer after horizontal/vertical flip, undo and redo with non-origin crop', async () => {
    const bytes = await readFile('tests/fixtures/generated/ui-4k.png')
    const image = await loadImage(bytes)
    const hash = 'a'.repeat(64)
    const initial = createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000',
      baseLayerId: '019c1f62-058e-7000-8000-000000000001', timestamp: '2026-10-20T00:00:00Z',
      source: { blobHash: hash, format: 'png', mimeType: 'image/png', provenance: 'fileOpen', width: image.width,
        height: image.height, orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
    const censor = createCensorLayer({ id: '019c1f62-058e-7000-8000-000000000002',
      region: { kind: 'rectangle', bounds: { x: 500, y: 500, width: 700, height: 350 } },
      effect: { mode: 'blur', strength: 12 } })
    const composition = createComposition('browser')
    const before = { ...initial, crop: { x: 300, y: 200, width: 1900, height: 1200 },
      layers: [...initial.layers, censor], presentation: { ...initial.presentation,
        composition: { ...composition, background: { ...composition.background, kind: 'blurred' as const } } } }
    const create = async () => {
      const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
      await renderer.initialize({ scene: createCanvas(1, 1) as unknown as HTMLCanvasElement,
        overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'blur-flip' })
      await renderer.createImageResource({ id: hash, width: image.width, height: image.height,
        source: image as unknown as HTMLImageElement })
      return renderer
    }
    const warm = await create()
    try {
      warm.setScene(createDocumentRenderScene(before))
      const original = await rgba(await warm.exportPng())
      for (const axis of ['horizontal', 'vertical'] as const) {
        const after = applyEditorCommand(before, createFlipCanvasCommand(before, axis))
        const fresh = await create()
        try {
          warm.setScene(createDocumentRenderScene(after))
          fresh.setScene(createDocumentRenderScene(after))
          const reflected = await rgba(await warm.exportPng())
          const freshPixels = await rgba(await fresh.exportPng())
          expect(Buffer.compare(Buffer.from(reflected), Buffer.from(freshPixels))).toBe(0)
          expect(Buffer.compare(Buffer.from(reflected), Buffer.from(original))).not.toBe(0)
          warm.setScene(createDocumentRenderScene(before))
          const undone = await rgba(await warm.exportPng())
          expect(Buffer.compare(Buffer.from(undone), Buffer.from(original))).toBe(0)
          warm.setScene(createDocumentRenderScene(after))
          const redone = await rgba(await warm.exportPng())
          expect(Buffer.compare(Buffer.from(redone), Buffer.from(reflected))).toBe(0)
        } finally {
          fresh.dispose()
        }
      }
    } finally {
      warm.dispose()
    }
  }, 60000)
})
