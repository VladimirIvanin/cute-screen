import {
  getStrokePoints,
  getStrokeOutlinePoints,
  type StrokePoint,
} from 'perfect-freehand'
import type {
  JsonObject,
  StraightSegment,
} from '../document/types'
import type { SampledPoint as FreehandSample } from '../document/types'

/** Resolve free spans independently; smoothing must never pull a straight anchor. */
export function constrainedFreehand(
  payload: JsonObject,
  samples: readonly FreehandSample[],
  width: number,
) {
  const ranges = payload.straightSegments as readonly StraightSegment[]
  const points: FreehandSample[] = []
  const strength = typeof payload.smoothing === 'number' ? payload.smoothing : .65
  const appendFree = (start: number, end: number) => {
    const source = samples.slice(start, end + 1)
    const resolved = payload.brush === 'pen' || strength === 0 || source.length <= 1 ? source
      : getStrokePoints(source.map((p) => [p.x, p.y, p.pressure]), {
          size: width, streamline: strength, smoothing: .6, last: true,
        }).map((p, index, all) => ({ x: p.point[0], y: p.point[1],
          pressure: index === 0 ? source[0]!.pressure
            : index === all.length - 1 ? source.at(-1)!.pressure : p.pressure }))
    // Both boundaries are shared anchors. A short stabilized span may have fewer samples.
    if (resolved.length) {
      resolved[0] = source[0]!
      resolved[resolved.length - 1] = source.at(-1)!
    }
    points.push(...(points.length ? resolved.slice(1) : resolved))
  }
  let cursor = 0
  for (const range of ranges) {
    appendFree(cursor, range.start)
    points.push(...samples.slice(range.start + 1, range.end + 1))
    cursor = range.end
  }
  appendFree(cursor, samples.length - 1)
  let runningLength = 0
  const strokePoints: StrokePoint[] = points.map((p, index) => {
    const previous = points[index - 1] ?? points[1] ?? p
    const dx = previous.x - p.x
    const dy = previous.y - p.y
    const distance = Math.hypot(dx, dy)
    if (index) runningLength += distance
    return { point: [p.x, p.y], pressure: p.pressure, distance: index ? distance : 0,
      vector: distance ? [dx / distance, dy / distance] : [1, 0], runningLength }
  })
  if (strokePoints.length > 1) strokePoints[0]!.vector = strokePoints[1]!.vector
  return { points, width, modern: true,
    outline: payload.brush === 'brush' ? getStrokeOutlinePoints(strokePoints, {
      size: width, smoothing: .6, thinning: .65, simulatePressure: payload.pressureMode !== 'pen', last: true,
    }).map(([x, y]) => ({ x: x!, y: y! })) : [] }
}
