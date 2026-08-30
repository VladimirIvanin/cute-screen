import { describe, expect, it } from 'vitest'

import { snapPoint } from './snap'

describe('M05 snapping', () => {
  it('uses a six CSS pixel threshold regardless of zoom', () => {
    const candidates = [{ id: 'center', x: 100, y: 100 }]
    expect(snapPoint({ x: 104, y: 96 }, candidates, 1)).toMatchObject({
      x: 100,
      y: 100,
    })
    expect(snapPoint({ x: 102, y: 98 }, candidates, 2)).toMatchObject({
      x: 100,
      y: 100,
    })
    expect(snapPoint({ x: 104, y: 96 }, candidates, 2)).toMatchObject({
      x: 104,
      y: 96,
    })
  })

  it('can be disabled for the active gesture without mutating candidates', () => {
    const result = snapPoint(
      { x: 101, y: 101 },
      [{ id: 'center', x: 100, y: 100 }],
      1,
      false,
    )
    expect(result).toEqual({ x: 101, y: 101, guides: [] })
  })
})
