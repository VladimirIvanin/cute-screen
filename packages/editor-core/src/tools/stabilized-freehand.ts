import { getStrokePoints } from 'perfect-freehand'
import type { SampledPoint } from '../document/types'

function interpolate(
  a: SampledPoint,
  b: SampledPoint,
  amount: number,
): SampledPoint {
  return {
    x: a.x + (b.x - a.x) * amount,
    y: a.y + (b.y - a.y) * amount,
    pressure: a.pressure + (b.pressure - a.pressure) * amount,
  }
}

/** Flatten a quadratic with at most 0.1 document px of chord error. */
function appendCurve(
  result: SampledPoint[],
  start: SampledPoint,
  control: SampledPoint,
  end: SampledPoint,
  depth = 0,
): void {
  const error = Math.hypot(start.x - 2 * control.x + end.x, start.y - 2 * control.y + end.y) / 4
  if (error <= .1 || depth >= 12) {
    result.push(end)
    return
  }
  const left = interpolate(start, control, .5)
  const right = interpolate(control, end, .5)
  const middle = interpolate(left, right, .5)
  appendCurve(result, start, left, middle, depth + 1)
  appendCurve(result, middle, right, end, depth + 1)
}

/** Round stabilized corners in shared geometry, so preview, export and hits agree. */
export function stabilizedFreehand(
  samples: readonly SampledPoint[],
  width: number,
  strength: number,
): readonly SampledPoint[] {
  const correction = Math.max(0, Math.min(1, strength))
  if (correction === 0 || samples.length <= 2) return samples
  const points = getStrokePoints(samples.map((p) => [p.x, p.y, p.pressure]), {
    size: width, streamline: correction, smoothing: .6, last: true,
  }).map((p) => ({ x: p.point[0], y: p.point[1], pressure: p.pressure }))
  // Exact endpoints also pin the boundaries of free spans adjoining Shift lines.
  points[0] = samples[0]!
  points[points.length - 1] = samples.at(-1)!
  const result = [samples[0]!]
  const rounding = Math.min(.5, correction)
  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1]!
    const control = points[i]!
    const next = points[i + 1]!
    const start = interpolate(control, previous, rounding)
    const end = interpolate(control, next, rounding)
    const tail = result.at(-1)!
    if (tail.x !== start.x || tail.y !== start.y) result.push(start)
    appendCurve(result, start, control, end)
  }
  result.push(samples.at(-1)!)
  return result
}
