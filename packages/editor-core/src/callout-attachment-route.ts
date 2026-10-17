import type {
  CalloutAttachment,
  Point,
  Rect,
} from './document/types'

/** Keep the final approach outside the label when its fixed side faces away from the target. */
export function calloutAttachmentRoute(
  points: readonly Point[],
  side: CalloutAttachment,
  bounds: Rect,
  clearance: number,
): readonly Point[] {
  const label = points.at(-1), previous = points.at(-2)
  if (!label || !previous) return points
  const normal = side === 'left' || side === 'right' ? 'x' : 'y'
  const tangent = normal === 'x' ? 'y' : 'x'
  const sign = side === 'left' || side === 'top' ? -1 : 1
  if ((previous[normal] - label[normal]) * sign >= 0) return points
  const prefix = points.slice(0, -1)
  const before = prefix.at(-2)
  // Only rebuild the adjacent section; earlier manual waypoints remain unchanged.
  if (before && before[normal] === previous[normal]) prefix.pop()
  const source = prefix.at(-1)!
  const extent = tangent === 'x' ? bounds.width : bounds.height
  const detour = source[tangent] < bounds[tangent] + extent / 2
    ? bounds[tangent] - clearance : bounds[tangent] + extent + clearance
  const edge = label[normal] + sign * clearance
  return [...prefix,
    { ...source, [tangent]: detour },
    { ...label, [normal]: edge, [tangent]: detour },
    { ...label, [normal]: edge }, label]
}
