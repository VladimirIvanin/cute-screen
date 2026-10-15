import {
  describe,
  expect,
  it,
} from 'vitest'
import { previewPlacement } from '../../../packages/editor-vue/src/shell/ui/preview-placement'

const view = { left: 0, top: 0, width: 1024, height: 768 }
describe('preview-preserving popovers', () => {
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
