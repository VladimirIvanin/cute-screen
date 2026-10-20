import type { FreeformPoint } from './types'

/** Version 1: normalized Gaussian fields in premultiplied sRGB; tiles use global pixel centers. */
export function rasterizeFreeform(
  points: readonly FreeformPoint[],
  width: number,
  height: number,
  startRow = 0,
  rowCount = height,
): Uint8ClampedArray {
  const bytes = new Uint8ClampedArray(width * Math.min(rowCount, height - startRow) * 4)
  for (let row = 0; row < bytes.length / (width * 4); row++) {
    const y = (row + startRow + 0.5) / height
    for (let col = 0; col < width; col++) {
      const x = (col + 0.5) / width
      let weight = 0, alpha = 0, red = 0, green = 0, blue = 0
      for (const p of points) {
        const distance = ((x - p.x) ** 2 + (y - p.y) ** 2) / (2 * p.radius ** 2)
        const w = Math.exp(-Math.min(700, distance))
        const a = p.color.alpha * w
        weight += w
        alpha += a
        red += p.color.red * a
        green += p.color.green * a
        blue += p.color.blue * a
      }
      const offset = (row * width + col) * 4
      if (alpha > 0) {
        bytes[offset] = Math.round(red / alpha * 255)
        bytes[offset + 1] = Math.round(green / alpha * 255)
        bytes[offset + 2] = Math.round(blue / alpha * 255)
        bytes[offset + 3] = Math.round(alpha / weight * 255)
      }
    }
  }
  return bytes
}
