import {
  createCanvas,
  type Canvas,
} from '@napi-rs/canvas'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createDocumentRenderScene,
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from '@cute-screen/editor-core'
import { documentFixture } from '../../editor-core/src/document/scene/test-kit'
import { Canvas2DRenderer } from './backends/canvas2d/renderer'
import type { Canvas2DLike } from './backends/canvas2d/contracts'

describe('annotation shadow in the live overlay', () => {
  it('draws ink and shadow during rotate without pixel readback or CPU filtering', async () => {
    const surfaces: Canvas[] = []
    const factory = (width: number, height: number) => {
      const surface = createCanvas(width, height)
      vi.spyOn(surface.getContext('2d'), 'getImageData').mockImplementation(() => {
        throw new Error('shadow pixel readback')
      })
      surfaces.push(surface)
      return surface as unknown as Canvas2DLike
    }
    const scene = createCanvas(1, 1), overlay = createCanvas(1, 1)
    const renderer = new Canvas2DRenderer({ exportCanvas: factory })
    await renderer.initialize({ scene: scene as unknown as HTMLCanvasElement,
      overlay: overlay as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'shadow-drag' })
    const layer = { ...createDrawingLayer({ id: 'arrow', tool: 'arrow', start: { x: 100, y: 180 }, end: { x: 600, y: 300 },
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, arrow: { ...DEFAULT_DRAWING_DEFAULTS.arrow, appearance: 'tapered' } } })!, annotationShadow: 'strong' as const }
    try {
      renderer.setScene(createDocumentRenderScene({ ...documentFixture,
        canvas: { width: 900, height: 700 }, layers: [] }))
      for (const rotation of [0, 15, 30]) {
        const snapshot = createDocumentRenderScene({ ...documentFixture, canvas: { width: 900, height: 700 },
          layers: [{ ...layer, transform: { ...layer.transform, rotation } }] })
        renderer.setOverlay(snapshot.nodes)
        expect(() => renderer.render(['overlay'])).not.toThrow()
        const pixels = overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data
        let ink = 0, shadow = 0
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i]! > 100 && pixels[i + 3]! > 100) ink++
          if (pixels[i]! === 0 && pixels[i + 3]! > 2) shadow++
        }
        expect(ink).toBeGreaterThan(500)
        expect(shadow).toBeGreaterThan(500)
        renderer.setScene(snapshot)
        await renderer.prepareEffects()
        renderer.render(['scene'])
        const settled = scene.getContext('2d').getImageData(0, 0, scene.width, scene.height).data
        expect(Buffer.from(settled).equals(Buffer.from(pixels))).toBe(true)
        expect(renderer.effectStats.preparedBytes).toBe(0)
      }
      expect(renderer.effectStats.groupFilteredPixels).toBe(0)
      expect(surfaces.every((surface) => surface.width === 1 && surface.height === 1)).toBe(true)
    } finally {
      renderer.dispose()
    }
  })
})
