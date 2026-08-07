import { describe, expect, it } from 'vitest'

import { compareRgba } from './golden'

describe('renderer golden harness self-test', () => {
  it('reports channel changes on a synthetic RGBA pixel', () => {
    const expected = Uint8Array.from([255, 0, 0, 255])
    const actual = Uint8Array.from([250, 0, 2, 255])

    expect(compareRgba(actual, expected)).toEqual({
      changedChannels: 2,
      maximumDelta: 5,
    })
  })
})
