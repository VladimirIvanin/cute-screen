import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  blurPixels,
  pixelatePixels,
} from './effects/pixels'
import {
  legacyBlurImageData,
  legacyPixelateImageData,
} from './legacy-pixel-effects.test-kit'

function fixture(
  width: number,
  height: number,
): ImageData {
  let seed = 71893
  return { width, height, data: Uint8ClampedArray.from({ length: width * height * 4 }, () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed >>> 24
  }) } as ImageData
}

describe('bounded pixel filters', () => {
  it.each([[1, 1, 12], [7, 5, 16], [37, 91, 6], [513, 71, 1], [1025, 103, 12]])(
    'preserves every legacy RGBA byte at %i×%i radius %i', (width, height, radius) => {
      const image = fixture(width, height)
      const expected = { ...image, data: image.data.slice() }
      legacyBlurImageData(expected, radius)
      blurPixels(image, radius)
      expect(image.data).toEqual(expected.data)
    },
  )

  it('uses a row ring instead of a full Float64 plane', () => {
    const sizes: number[] = []
    const Original = Float64Array
    vi.stubGlobal('Float64Array', new Proxy(Original, { construct(
      target,
      args,
    ) {
      sizes.push(Number(args[0]))
      return Reflect.construct(target, args)
    } }))
    try {
      blurPixels(fixture(700, 500), 6)
      expect(Math.max(...sizes)).toBeLessThanOrEqual(700 * 4 * 14)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it.each([1, 6, 12, 128])('preserves mosaic centre samples and edge blocks at %i', (size) => {
    const image = fixture(71, 57)
    const expected = { ...image, data: image.data.slice() }
    legacyPixelateImageData(expected, size)
    pixelatePixels(image, size)
    expect(image.data).toEqual(expected.data)
  })
})
