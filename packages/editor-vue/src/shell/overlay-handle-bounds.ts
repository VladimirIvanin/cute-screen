export interface RectBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasPoint {
  x: number
  y: number
}

export interface ClampedHandleRect {
  x: number
  y: number
  size: number
}

/**
 * Keeps a square handle fully inside the visible overlay bitmap. Handles are
 * centered on edge coordinates, so without clamping half of each handle can
 * fall outside the canvas and be clipped by HTMLCanvasElement.
 */
export function clampHandleRectInBounds(
  center: CanvasPoint,
  half: number,
  bounds: RectBounds,
): ClampedHandleRect {
  const size = half * 2
  const minX = bounds.x
  const minY = bounds.y
  const maxX = Math.max(minX, bounds.x + bounds.width - size)
  const maxY = Math.max(minY, bounds.y + bounds.height - size)
  return {
    x: Math.min(Math.max(center.x - half, minX), maxX),
    y: Math.min(Math.max(center.y - half, minY), maxY),
    size,
  }
}

export function drawClampedHandleSquare(
  context: CanvasRenderingContext2D,
  center: CanvasPoint,
  half: number,
  bounds: RectBounds,
): void {
  const rect = clampHandleRectInBounds(center, half, bounds)
  context.fillRect(rect.x, rect.y, rect.size, rect.size)
  context.strokeRect(rect.x, rect.y, rect.size, rect.size)
}
