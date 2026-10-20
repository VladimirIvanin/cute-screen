/** Binary-only worker boundary, also usable without DOM ImageData. */
export interface PixelBuffer {
  readonly width: number
  readonly height: number
  data: Uint8ClampedArray
}

/** Legacy separable box blur, preserving each column's floating point recurrence.
 * Horizontal rows are read before their source pixels are overwritten. */
export function blurPixels(
  image: PixelBuffer,
  radius: number,
): void {
  const { width, height, data } = image
  const stride = width * 4
  const window = radius * 2 + 1
  const rows = Math.min(height, window + 1)
  const ring = new Float64Array(rows * stride)
  const loaded = new Int32Array(rows).fill(-1)
  const vertical = new Float64Array(stride)
  function horizontal(y: number): number {
    const slot = y % rows
    const base = slot * stride
    if (loaded[slot] === y) return base
    loaded[slot] = y
    const sums = [0, 0, 0, 0]
    for (let sample = -radius; sample <= radius; sample++) {
      const offset = y * stride + Math.max(0, Math.min(width - 1, sample)) * 4
      for (let c = 0; c < 4; c++) sums[c]! += data[offset + c]!
    }
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 4; c++) ring[base + x * 4 + c] = sums[c]! / window
      const remove = y * stride + Math.max(0, x - radius) * 4
      const add = y * stride + Math.min(width - 1, x + radius + 1) * 4
      for (let c = 0; c < 4; c++) sums[c]! += data[add + c]! - data[remove + c]!
    }
    return base
  }
  for (let sample = -radius; sample <= radius; sample++) {
    const row = horizontal(Math.max(0, Math.min(height - 1, sample)))
    for (let i = 0; i < stride; i++) vertical[i]! += ring[row + i]!
  }
  for (let y = 0; y < height; y++) {
    // Load the incoming row before writing the output (radius can exceed height).
    const remove = horizontal(Math.max(0, y - radius))
    const add = horizontal(Math.min(height - 1, y + radius + 1))
    for (let i = 0; i < stride; i++) {
      data[y * stride + i] = Math.round(vertical[i]! / window)
      vertical[i]! += ring[add + i]! - ring[remove + i]!
    }
  }
}

export function pixelatePixels(
  image: PixelBuffer,
  blockSize: number,
): void {
  const { width, height, data } = image
  for (let y = 0; y < height; y += blockSize) {
    const sy = Math.min(height - 1, y + Math.floor(blockSize / 2))
    for (let x = 0; x < width; x += blockSize) {
      const sx = Math.min(width - 1, x + Math.floor(blockSize / 2))
      const offset = (sy * width + sx) * 4
      const sample = [data[offset]!, data[offset + 1]!, data[offset + 2]!, data[offset + 3]!]
      for (let ty = y; ty < Math.min(height, y + blockSize); ty++) {
        for (let tx = x; tx < Math.min(width, x + blockSize); tx++) {
          const target = (ty * width + tx) * 4
          data[target] = sample[0]!
          data[target + 1] = sample[1]!
          data[target + 2] = sample[2]!
          data[target + 3] = sample[3]!
        }
      }
    }
  }
}
