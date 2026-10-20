import {
  describe,
  expect,
  it,
} from 'vitest'
import { createCardBackground } from './defaults'
import { rasterizeFreeform } from './freeform'

describe('deterministic freeform field', () => {
  it('uses premultiplied alpha without bleeding invisible colors', () => {
    const points = createCardBackground().freeform.points.map((p, i) => ({ ...p, color: {
      red: i === 0 ? 1 : 0, green: i === 0 ? 0 : 1, blue: 0, alpha: i === 0 ? 0 : 1 } }))
    const bytes = rasterizeFreeform(points, 31, 17)
    for (let n = 0; n < bytes.length; n += 4) expect(bytes[n]).toBe(0)
    expect(rasterizeFreeform(points, 31, 17)).toEqual(bytes)
  })
  it('supports exact tile reconstruction and coincident control points', () => {
    const points = createCardBackground().freeform.points.map((p) => ({ ...p, x: 0.5, y: 0.5 }))
    const full = rasterizeFreeform(points, 33, 21)
    const lower = rasterizeFreeform(points, 33, 21, 9, 12)
    expect(lower).toEqual(full.slice(33 * 9 * 4))
  })
})
