import { createCanvas } from '@napi-rs/canvas'
import {
  computed,
  shallowRef,
} from 'vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { CanvasOverlayController } from '../../../packages/editor-vue/src/shell/canvas/overlay-controller'
import type { CanvasOverlayContext } from '../../../packages/editor-vue/src/shell/canvas/overlay-controller'
import { document as fixture } from './canvas-viewport-test-kit'

describe('selection chrome display resolution', () => {
  it.each([false, true])('keeps one CSS-pixel dashes at zoom 2 / DPR 2 (Quick %s)', (quickFrameMode) => {
    const canvas = createCanvas(100, 100)
    const overlay = Object.assign(canvas, {
      closest: () => null,
      getBoundingClientRect: () => ({ width: 200, height: 200 }),
    }) as unknown as HTMLCanvasElement
    const layer = { ...fixture.layers[0]!, locked: true }
    const context = {
      props: { canvas: fixture.canvas, zoom: 200, quickFrameMode },
      overlay: shallowRef(overlay),
      outputBounds: computed(() => ({ x: 0, y: 0, width: 100, height: 100 })),
      renderer: { renderOverlay: () => false, renderHighlighterDraft: () => undefined },
      drawingLayer: () => undefined,
      previewNodes: () => [],
      previewLayer: () => undefined,
      selectedLayer: () => layer,
      layerBounds: () => layer.localBounds,
      drawDrafts: vi.fn(),
      drawCrop: () => quickFrameMode,
    } as unknown as CanvasOverlayContext
    const previousDpr = window.devicePixelRatio
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })
    try {
      new CanvasOverlayController(context).draw()
      expect([overlay.width, overlay.height]).toEqual([400, 400])
      // Frame starts at world (10,10) = display (40,40). A 4 CSS-px dash
      // occupies 8 display pixels; its 1 CSS-px stroke occupies two rows.
      const pixels = overlay.getContext('2d')!.getImageData(42, 36, 20, 8).data
      const rows = Array.from({ length: 8 }, (_, y) =>
        Array.from({ length: 20 }, (_, x) => pixels[(y * 20 + x) * 4 + 3]!).filter((alpha) => alpha > 0).length)
      expect(rows.filter((count) => count > 0)).toHaveLength(2)
      expect(rows[3]).toBe(14)
      expect(rows[4]).toBe(14)
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: previousDpr })
    }
  })
})
