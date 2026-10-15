import { createCanvas } from '@napi-rs/canvas'
import { shallowRef } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { prepareQuickOverlay } from '../../../packages/editor-vue/src/shell/canvas/quick-overlay-resolution'
import { CropController } from '../../../packages/editor-vue/src/shell/canvas/crop-controller'
import type { CanvasViewportProps } from '../../../packages/editor-vue/src/shell/canvas/contracts'

describe('Quick Capture display resolution overlay', () => {
  it.each([1, 2])(
    'rasterizes UI at CSS pixels × DPR %s without enlarging image pixels',
    (dpr) => {
      const canvas = createCanvas(400, 300)
      const overlay = Object.assign(canvas, {
        getBoundingClientRect: () => ({ width: 1440, height: 1080 }),
      }) as unknown as HTMLCanvasElement
      const bounds = { x: 0, y: 0, width: 400, height: 300 }
      const context = overlay.getContext('2d')!
      prepareQuickOverlay(overlay, context, bounds, 3.6, dpr)
      expect([overlay.width, overlay.height]).toEqual([1440 * dpr, 1080 * dpr])
      // A one CSS-pixel UI line occupies native display pixels, never a scaled source texel.
      context.fillStyle = '#fff'
      context.fillRect(10 / 3.6, 10 / 3.6, 1 / 3.6, 10 / 3.6)
      const pixels = context.getImageData(8 * dpr, 12 * dpr, 5 * dpr, 1).data
      const alpha = Array.from({ length: 5 * dpr }, (_, x) => pixels[x * 4 + 3])
      expect(alpha.filter((value) => value === 255)).toHaveLength(dpr)
      expect(
        alpha.filter((value) => value !== 0 && value !== 255),
      ).toHaveLength(0)
    },
  )

  it('uses the visible document scale for badge text and border hit tolerance', () => {
    const scene = Object.assign(document.createElement('canvas'), {
      width: 400,
      height: 300,
    })
    scene.getBoundingClientRect = () =>
      ({ width: 1440, height: 1080 }) as DOMRect
    const overlay = Object.assign(document.createElement('canvas'), {
      width: 2880,
      height: 2160,
    })
    overlay.getBoundingClientRect = scene.getBoundingClientRect
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      setLineDash: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D
    const crop = new CropController({
      props: {
        canvas: { width: 400, height: 300 },
        quickFrameMode: true,
        quickSelectionMode: true,
        zoom: 100,
      } as CanvasViewportProps,
      emit: vi.fn(),
      overlay: shallowRef(overlay),
      scene: shallowRef(scene),
      rendererError: shallowRef(),
    })
    crop.quickDraft = { x: 10, y: 20, width: 300, height: 200 }
    crop.draw(context, { x: 0, y: 0, width: 400, height: 300 })
    expect(context.font).toBe(`${13 / 3.6}px Roboto, sans-serif`)
    expect(context.setLineDash).toHaveBeenCalledWith([7 / 3.6, 5 / 3.6])
    expect(
      crop.handleAtPoint(
        { crop: crop.quickDraft } as NonNullable<typeof crop.session>,
        { x: 13, y: 20 },
      ),
    ).toBeUndefined()
  })

  it('clears stale pixels and maps non-origin bounds without resetting document coordinates', () => {
    const canvas = createCanvas(400, 300)
    const overlay = Object.assign(canvas, {
      getBoundingClientRect: () => ({ width: 150, height: 100 }),
    }) as unknown as HTMLCanvasElement
    const context = overlay.getContext('2d')!
    prepareQuickOverlay(
      overlay,
      context,
      { x: 60, y: 20, width: 300, height: 200 },
      0.5,
      2,
    )
    expect([overlay.width, overlay.height]).toEqual([300, 200])
    context.fillStyle = '#fff'
    context.fillRect(60, 20, 1, 1)
    expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(255)
    prepareQuickOverlay(
      overlay,
      context,
      { x: 60, y: 20, width: 300, height: 200 },
      0.5,
      2,
    )
    expect(context.getImageData(0, 0, 1, 1).data[3]).toBe(0)
  })
})
