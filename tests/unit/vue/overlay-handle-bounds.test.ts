import { describe, expect, it } from 'vitest'

import {
  clampHandleRectInBounds,
  type RectBounds,
} from '../../../packages/editor-vue/src/shell/overlay-handle-bounds'

describe('overlay handle bounds', () => {
  const bounds: RectBounds = { x: 0, y: 0, width: 100, height: 80 }

  it('keeps a top-edge handle fully inside the bitmap', () => {
    const rect = clampHandleRectInBounds({ x: 50, y: 0 }, 4, bounds)
    expect(rect).toEqual({ x: 46, y: 0, size: 8 })
  })

  it('keeps a corner handle fully inside the bitmap', () => {
    const rect = clampHandleRectInBounds({ x: 0, y: 0 }, 4, bounds)
    expect(rect).toEqual({ x: 0, y: 0, size: 8 })
  })

  it('leaves interior handles centered', () => {
    const rect = clampHandleRectInBounds({ x: 50, y: 40 }, 4, bounds)
    expect(rect).toEqual({ x: 46, y: 36, size: 8 })
  })

  it('keeps a bottom-right handle fully inside the bitmap', () => {
    const rect = clampHandleRectInBounds({ x: 100, y: 80 }, 4, bounds)
    expect(rect).toEqual({ x: 92, y: 72, size: 8 })
  })
})
