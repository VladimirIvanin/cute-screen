import type {
  JsonObject,
  Point,
  PencilLayer,
  MarkerLayer,
} from '../document/types'

export function rebaseFreehandLayer<T extends PencilLayer | MarkerLayer>(layer: T): T {
  const geometry = resolveFreehandGeometry(layer.payload, layer.kind === 'pencil')
  if (!geometry.points.length) return layer
  const padding = Math.max(0.5, geometry.width / 2)
  let x = Infinity
  let y = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const point of geometry.points) {
    x = Math.min(x, point.x - padding)
    y = Math.min(y, point.y - padding)
    right = Math.max(right, point.x + padding)
    bottom = Math.max(bottom, point.y + padding)
  }
  return { ...layer, localBounds: { x, y, width: right - x, height: bottom - y } }
}
export interface FreehandSample extends Point {
  readonly pressure: number
}
/** One geometry contract for scene, hit testing, previews and brush thumbnails. */
export function resolveFreehandGeometry(
  payload: JsonObject,
  pencil: boolean,
): Readonly<{
  points: readonly FreehandSample[]
  width: number
}> {
  const source = Array.isArray(payload.points) ? payload.points : []
  const samples = source.map((value) => {
    const point = value as Record<string, unknown>
    return {
      x: typeof point.x === 'number' ? point.x : 0,
      y: typeof point.y === 'number' ? point.y : 0,
      pressure: typeof point.pressure === 'number' ? Math.max(0, Math.min(1, point.pressure)) : 0.5,
    }
  })
  const strength = pencil && typeof payload.smoothing === 'number' ? Math.max(0, Math.min(1, payload.smoothing)) : 0
  const points = strength === 0 ? samples : samples.map((sample, index) => {
    if (index === 0 || index === samples.length - 1)
      return sample
    let x = 0
    let y = 0
    let total = 0
    for (let offset = -2; offset <= 2; offset++) {
      const next = samples[index + offset]
      if (!next)
        continue
      const weight = 3 - Math.abs(offset)
      x += next.x * weight
      y += next.y * weight
      total += weight
    }
    return {
      ...sample, x: sample.x + (x / total - sample.x) * strength, y: sample.y + (y / total - sample.y) * strength,
    }
  })
  const scale = pencil && payload.brush === 'pencil' ? 0.65 : pencil && payload.brush === 'brush' ? 1.5 : 1
  return {
    points, width: (typeof payload.width === 'number' ? payload.width : 1) * scale,
  }
}
