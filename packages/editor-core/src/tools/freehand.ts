import { constrainedFreehand } from './constrained-freehand'
import { stabilizedFreehand } from './stabilized-freehand'
import {
  getStroke,
  getStrokePoints,
} from 'perfect-freehand'
import type {
  JsonObject,
  Point,
  PencilLayer,
  MarkerLayer,
  SampledPoint,
} from '../document/types'

export function rebaseFreehandLayer<T extends PencilLayer | MarkerLayer>(layer: T): T {
  const geometry = resolveFreehandGeometry(layer.payload, layer.kind === 'pencil')
  if (!geometry.points.length) return layer
  const boundary = geometry.outline.length ? geometry.outline : geometry.points
  const padding = geometry.outline.length ? 0 : Math.max(0.5, geometry.width / 2)
  let x = Infinity
  let y = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const point of boundary) {
    x = Math.min(x, point.x - padding)
    y = Math.min(y, point.y - padding)
    right = Math.max(right, point.x + padding)
    bottom = Math.max(bottom, point.y + padding)
  }
  return { ...layer, localBounds: { x, y, width: right - x, height: bottom - y } }
}
export type FreehandSample = SampledPoint

function freehandSamples(payload: JsonObject): readonly FreehandSample[] {
  const source = Array.isArray(payload.points) ? payload.points : []
  return source.map((value) => {
    const point = value as Record<string, unknown>
    return {
      x: typeof point.x === 'number' ? point.x : 0,
      y: typeof point.y === 'number' ? point.y : 0,
      pressure: typeof point.pressure === 'number' ? Math.max(0, Math.min(1, point.pressure)) : .5,
    }
  })
}
type FreehandGeometry = Readonly<{
  points: readonly FreehandSample[]
  width: number
  outline: readonly Point[]
  modern: boolean
}>

function modernFreehand(
  payload: JsonObject,
  samples: readonly FreehandSample[],
  width: number,
): FreehandGeometry {
  const strength = typeof payload.smoothing === 'number' ? payload.smoothing : .65
  if (payload.brush === 'stabilized') {
    return { points: stabilizedFreehand(samples, width, strength), width, outline: [], modern: true }
  }
  if (
    payload.brush === 'pen' ||
    samples.length <= 1 &&
    payload.brush !== 'brush'
  ) {
    return { points: samples, width, outline: [], modern: true }
  }
  const input = samples.map((point) => [point.x, point.y, point.pressure])
  const options = {
    size: width, streamline: strength, smoothing: .6,
    thinning: payload.brush === 'brush' ? .65 : 0,
    simulatePressure: payload.pressureMode !== 'pen', last: true,
  }
  const points = strength === 0 ? samples : getStrokePoints(input, options).map((point, index, result) => ({
    x: point.point[0], y: point.point[1],
    pressure: index === 0 ? samples[0]!.pressure
      : index === result.length - 1 ? samples.at(-1)!.pressure : point.pressure,
  }))
  return {
    points, width, modern: true,
    outline: payload.brush === 'brush' ? getStroke(input, options).map(([x, y]) => ({ x: x!, y: y! })) : [],
  }
}

/** One geometry contract for scene, hit testing, previews and brush thumbnails. */
export function resolveFreehandGeometry(
  payload: JsonObject,
  pencil: boolean,
): FreehandGeometry {
  const samples = freehandSamples(payload)
  const width = typeof payload.width === 'number' ? payload.width : 1
  if (pencil && payload.strokeVersion === 3) return constrainedFreehand(payload, samples, width)
  if (pencil && payload.strokeVersion === 2) {
    return modernFreehand(payload, samples, width)
  }
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
    points, width: width * scale, outline: [], modern: false,
  }
}

/** Non-zero winding matches the polygon fill rule in both renderer backends. */
export function freehandOutlineContains(
  outline: readonly Point[],
  point: Point,
): boolean {
  let winding = 0
  for (let index = 0; index < outline.length; index++) {
    const a = outline[index]!
    const b = outline[(index + 1) % outline.length]!
    const cross = (b.x - a.x) * (point.y - a.y) - (point.x - a.x) * (b.y - a.y)
    if (
      Math.abs(cross) < 1e-8 &&
      point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) &&
      point.y >= Math.min(a.y, b.y) &&
      point.y <= Math.max(a.y, b.y)
    ) return true
    if (
      a.y <= point.y &&
      b.y > point.y &&
      cross > 0
    ) winding++
    if (
      a.y > point.y &&
      b.y <= point.y &&
      cross < 0
    ) winding--
  }
  return winding !== 0
}

function unitInterval(
  input: unknown,
  fallback: number,
): number {
  if (
    typeof input !== 'number' ||
    !Number.isFinite(input) ||
    input < 0 ||
    input > 1
  ) return fallback
  return input
}

/** Preferences-only normalization; persisted legacy documents never use this. */
export function normalizePencilDefaults(value: JsonObject): JsonObject {
  const brush = value.brush === 'pencil' ? 'pen'
    : value.brush === 'pen' ? 'pen' : 'stabilized'
  const memories = value.brushSmoothing && typeof value.brushSmoothing === 'object'
    && !Array.isArray(value.brushSmoothing) ? value.brushSmoothing as JsonObject : {}
  const smoothing = value.brush === 'brush'
    ? unitInterval(memories.stabilized, .65) : unitInterval(value.smoothing, .65)
  return {
    ...value, brush, strokeVersion: 2, pressureMode: 'simulated', smoothing,
    brushSmoothing: {
      stabilized: unitInterval(memories.stabilized, brush === 'stabilized' ? smoothing : .65),
    },
  }
}

export function changePencilBrush(
  current: JsonObject,
  brush: string,
): JsonObject {
  if (!['pen', 'pencil', 'stabilized'].includes(brush)) throw new RangeError('unsupported pencil brush')
  const previous = normalizePencilDefaults(current)
  const memories = { ...previous.brushSmoothing as JsonObject }
  if (current.brush === 'stabilized') memories.stabilized = previous.smoothing!
  return {
    ...previous, strokeVersion: current.strokeVersion === 3 ? 3 : 2, brush: brush === 'pencil' ? 'pen' : brush,
    pressureMode: current.pressureMode === 'pen' ? 'pen' : 'simulated',
    smoothing: brush === 'pen' || brush === 'pencil' ? 0 : memories[brush]!, brushSmoothing: memories,
  }
}
