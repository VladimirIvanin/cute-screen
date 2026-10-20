// Frozen pre-optimization reference; intentionally independent of the new kernel.
interface LegacyPixels {
  readonly width: number
  readonly height: number
  readonly data: Uint8ClampedArray
}
export function legacyPixelateImageData(
  image: LegacyPixels,
  blockSize: number,
): void {
  const source = new Uint8ClampedArray(image.data)
  for (let y = 0; y < image.height; y += blockSize) {
    const sampleY = Math.min(image.height - 1, y + Math.floor(blockSize / 2))
    for (let x = 0; x < image.width; x += blockSize) {
      const sampleX = Math.min(image.width - 1, x + Math.floor(blockSize / 2))
      const sampleOffset = (sampleY * image.width + sampleX) * 4
      const edgeX = Math.min(image.width, x + blockSize)
      const edgeY = Math.min(image.height, y + blockSize)
      for (let targetY = y; targetY < edgeY; targetY += 1) {
        for (let targetX = x; targetX < edgeX; targetX += 1) {
          const targetOffset = (targetY * image.width + targetX) * 4
          image.data[targetOffset] = source[sampleOffset]!
          image.data[targetOffset + 1] = source[sampleOffset + 1]!
          image.data[targetOffset + 2] = source[sampleOffset + 2]!
          image.data[targetOffset + 3] = source[sampleOffset + 3]!
        }
      }
    }
  }
}

/** Deterministic separable box blur. CanvasKit uses a Gaussian filter, so
 * cross-backend assertions intentionally use a documented pixel tolerance. */
export function legacyBlurImageData(
  image: LegacyPixels,
  radius: number,
): void {
  const width = image.width
  const height = image.height
  const source = new Uint8ClampedArray(image.data)
  const horizontal = new Float64Array(source.length)
  const window = radius * 2 + 1
  for (let y = 0; y < height; y += 1) {
    const sums = [0, 0, 0, 0]
    for (let sampleX = -radius; sampleX <= radius; sampleX += 1) {
      const x = Math.max(0, Math.min(width - 1, sampleX))
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! += source[offset + channel]!
      }
    }
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        horizontal[offset + channel] = sums[channel]! / window
      }
      const removeX = Math.max(0, x - radius)
      const addX = Math.min(width - 1, x + radius + 1)
      const removeOffset = (y * width + removeX) * 4
      const addOffset = (y * width + addX) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! += source[addOffset + channel]! - source[removeOffset + channel]!
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    const sums = [0, 0, 0, 0]
    for (let sampleY = -radius; sampleY <= radius; sampleY += 1) {
      const y = Math.max(0, Math.min(height - 1, sampleY))
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! += horizontal[offset + channel]!
      }
    }
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        image.data[offset + channel] = Math.round(sums[channel]! / window)
      }
      const removeY = Math.max(0, y - radius)
      const addY = Math.min(height - 1, y + radius + 1)
      const removeOffset = (removeY * width + x) * 4
      const addOffset = (addY * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! += horizontal[addOffset + channel]! - horizontal[removeOffset + channel]!
      }
    }
  }
}
