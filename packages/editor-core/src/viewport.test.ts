import { describe, expect, it } from 'vitest'

import { transformPoint } from './geometry'
import { fitViewport, panViewport, zoomAt } from './viewport'

describe('viewport state', () => {
  it('fits the independent canvas with 24 CSS px padding', () => {
    const viewport = fitViewport(
      { width: 1048, height: 848, dpr: 2 },
      { width: 1000, height: 1000 },
    )
    expect(viewport.zoom).toBe(0.8)
    expect(viewport.pan).toEqual({ x: 124, y: 24 })
  })

  it('clamps pan to the documented 64 CSS px overscroll', () => {
    const viewport = fitViewport(
      { width: 500, height: 500, dpr: 1 },
      { width: 1000, height: 1000 },
    )
    const panned = panViewport(
      viewport,
      { width: 1000, height: 1000 },
      { x: 10000, y: 10000 },
    )
    expect(panned.pan).toEqual({ x: 64, y: 64 })
  })

  it('keeps the canvas point under the cursor while zooming', () => {
    const fit = fitViewport(
      { width: 1048, height: 848, dpr: 1 },
      { width: 1000, height: 1000 },
    )
    const cursor = { x: 320, y: 400 }
    const before = transformPoint(fit.screenToCanvas, cursor)
    const after = zoomAt(fit, cursor, 1.25)
    const restored = transformPoint(after.screenToCanvas, cursor)
    expect(restored.x).toBeCloseTo(before.x)
    expect(restored.y).toBeCloseTo(before.y)
  })
})
