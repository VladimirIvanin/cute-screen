import {
  describe,
  expect,
  it,
} from 'vitest'
import { previewPlacement } from '../../../packages/editor-vue/src/shell/ui/preview-placement'

const view = { left: 0, top: 0, width: 1024, height: 768 }
describe('preview-preserving popovers', () => {
  it('keeps a nested menu close when the selected callout and chrome fill the nearby space', () => {
    const anchor = { left: 346, top: 445, width: 98, height: 36 }
    const toolbar = { left: 154, top: 439, width: 296, height: 48 }
    const callout = { left: 282, top: 80, width: 1340, height: 322 }
    const result = previewPlacement(anchor, { width: 324, height: 129 },
      { left: 0, top: 64, width: 1024, height: 480 },
      [callout, toolbar, { left: 128, top: 489, width: 750, height: 48 }])
    expect(result.left).toBeGreaterThanOrEqual(8)
    expect(result.top).toBeGreaterThanOrEqual(72)
    expect(result.top + result.height).toBeLessThanOrEqual(536)
    expect(Math.hypot(
      Math.max(0, anchor.left - result.left - result.width, result.left - anchor.left - anchor.width),
      Math.max(0, anchor.top - result.top - result.height, result.top - anchor.top - anchor.height),
    )).toBeLessThanOrEqual(16)
    expect(result.left + result.width <= toolbar.left || result.left >= toolbar.left + toolbar.width ||
      result.top + result.height <= toolbar.top || result.top >= toolbar.top + toolbar.height).toBe(true)
  })
  it('finds the free corner beside a toolbar and below an object', () => {
    const result = previewPlacement({ left: 346, top: 445, width: 98, height: 36 },
      { width: 324, height: 129 }, { left: 0, top: 0, width: 1024, height: 600 }, [
        { left: 282, top: 80, width: 1340, height: 322 },
        { left: 154, top: 439, width: 296, height: 48 },
      ])
    expect(result.left).toBeGreaterThanOrEqual(450)
    expect(result.left).toBeLessThanOrEqual(458)
    expect(result.top).toBe(410)
  })
  it('opens away from the figure below its toolbar', () => {
    const result = previewPlacement({ left: 380, top: 300, width: 54, height: 36 },
      { width: 252, height: 224 }, view, [{ left: 350, top: 350, width: 250, height: 240 }])
    expect(result.side).toBe('top')
    expect(result.top + result.height).toBeLessThan(300)
  })
  it('uses a side when a top-edge toolbar and a tall figure block vertical positions', () => {
    const result = previewPlacement({ left: 350, top: 8, width: 270, height: 36 },
      { width: 252, height: 224 }, view, [{ left: 350, top: 50, width: 270, height: 710 }])
    expect(['left', 'right']).toContain(result.side)
    expect(result.left + result.width <= 350 || result.left >= 620).toBe(true)
  })
  it('bounds oversized panels and keeps a viable side stable', () => {
    const anchor = { left: 470, top: 360, width: 32, height: 32 }
    const previous = { left: 510, top: 300, width: 100, height: 100, side: 'right' as const }
    expect(previewPlacement(anchor, previous, view, [], previous).side).toBe('right')
    const large = previewPlacement(anchor, { width: 2000, height: 1500 }, view, [view])
    expect(large.width).toBe(1008)
    expect(large.height).toBe(752)
    expect(large.left).toBe(8)
    expect(large.top).toBe(8)
  })
})
