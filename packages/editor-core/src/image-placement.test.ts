import {
  describe,
  expect,
  it,
} from 'vitest'
import { imagePlacement } from './image-placement'

describe('image insertion placement', () => {
  const bounds = { x: 120, y: 80, width: 1000, height: 500 }
  it('fits a 4K source without changing its intrinsic dimensions', () => {
    expect(imagePlacement(3840, 2160, bounds)).toEqual({
      scale: 400 / 2160,
      x: 620 - (3840 * (400 / 2160)) / 2,
      y: 130,
    })
  })
  it('does not enlarge small images', () => {
    expect(imagePlacement(20, 10, bounds)).toEqual({ scale: 1, x: 610, y: 325 })
  })
  it('clamps a drop near the edge to the visible crop', () => {
    expect(imagePlacement(200, 100, bounds, { x: 1120, y: 580 }))
      .toEqual({ scale: 1, x: 920, y: 480 })
  })
  it('rejects an empty visible intersection and non-finite coordinates', () => {
    expect(() => imagePlacement(20, 10, { ...bounds, width: 0 })).toThrow()
    expect(() => imagePlacement(20, 10, bounds, { x: NaN, y: 0 })).toThrow()
  })
})
