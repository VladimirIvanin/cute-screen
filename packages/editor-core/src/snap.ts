export interface SnapCandidate {
  readonly id: string
  readonly x: number
  readonly y: number
}

export interface SnapResult {
  readonly x: number
  readonly y: number
  readonly guides: readonly SnapCandidate[]
}

/** Six CSS pixels, converted into canvas coordinates for the active zoom. */
export function snapPoint(
  point: { readonly x: number; readonly y: number },
  candidates: readonly SnapCandidate[],
  zoom: number,
  enabled = true,
): SnapResult {
  if (!enabled || zoom <= 0) return Object.freeze({ ...point, guides: [] })
  const threshold = 6 / zoom
  const x = nearest(
    point.x,
    candidates.map((candidate) => candidate.x),
    threshold,
  )
  const y = nearest(
    point.y,
    candidates.map((candidate) => candidate.y),
    threshold,
  )
  const guides = candidates.filter(
    (candidate) => candidate.x === x.value || candidate.y === y.value,
  )
  return Object.freeze({
    x: x.value,
    y: y.value,
    guides: Object.freeze(guides),
  })
}

function nearest(value: number, values: readonly number[], threshold: number) {
  const candidate = values
    .map((current) => ({ current, distance: Math.abs(current - value) }))
    .filter(({ distance }) => distance <= threshold)
    .sort((left, right) => left.distance - right.distance)[0]
  return { value: candidate?.current ?? value }
}
