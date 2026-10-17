import type {
  Point,
  StraightSegment,
} from '../document/types'
import type { SampledPoint as FreehandSample } from '../document/types'

type InputSample = Point & { readonly pressure?: number }

/** Transient gesture state. Only points and ranges belong in the document. */
export interface StrokeState {
  readonly points: readonly FreehandSample[]
  readonly straightSegments: readonly StraightSegment[]
  readonly raw: FreehandSample
  readonly offset: Point
  readonly straightStart: number | undefined
}

function sample(point: InputSample): FreehandSample {
  return { x: point.x, y: point.y, pressure: point.pressure ?? .5 }
}

export function beginStroke(
  point: InputSample,
  straight: boolean,
): StrokeState {
  const raw = sample(point)
  return { points: [raw], straightSegments: [], raw, offset: { x: 0, y: 0 },
    straightStart: straight ? 0 : undefined }
}

export function setStrokeStraight(
  state: StrokeState,
  straight: boolean,
): StrokeState {
  if (straight === (state.straightStart !== undefined)) return state
  const end = state.points.at(-1)!
  return { ...state, straightStart: straight ? state.points.length - 1 : undefined,
    offset: straight ? state.offset : { x: end.x - state.raw.x, y: end.y - state.raw.y } }
}

/** Replace the active straight suffix; free samples and completed sections stay fixed. */
export function moveStroke(
  previous: StrokeState,
  input: InputSample,
  straight = previous.straightStart !== undefined,
  final = false,
): StrokeState {
  const state = setStrokeStraight(previous, straight)
  const raw = sample(input)
  const point = { ...raw, x: raw.x + state.offset.x, y: raw.y + state.offset.y }
  const last = state.points.at(-1)!
  if (state.straightStart === undefined) {
    const distance = Math.hypot(point.x - last.x, point.y - last.y)
    return { ...state, raw, points: distance >= .5 || final && distance > 0 ? [...state.points, point] : state.points }
  }
  const startIndex = state.straightStart
  const anchor = state.points[startIndex]!
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  const length = Math.hypot(dx, dy)
  if (length === 0 && state.points.length === startIndex + 1) return { ...state, raw }
  if (
    raw.x === state.raw.x &&
    raw.y === state.raw.y &&
    raw.pressure === state.raw.pressure
  ) return { ...state, raw }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4
  const cosine = Math.cos(angle)
  const sine = Math.sin(angle)
  const end = { x: anchor.x + (Math.abs(cosine) < 1e-12 ? 0 : cosine * length),
    y: anchor.y + (Math.abs(sine) < 1e-12 ? 0 : sine * length) }
  // Preserve pressure samples along the single current segment, including pen coalescing.
  const pressures = [...state.points.slice(startIndex + 1).map((p) => p.pressure), raw.pressure]
  const suffix = pressures.map((pressure, index) => ({
    x: anchor.x + (end.x - anchor.x) * (index + 1) / pressures.length,
    y: anchor.y + (end.y - anchor.y) * (index + 1) / pressures.length,
    pressure,
  }))
  return { ...state, raw, points: [...state.points.slice(0, startIndex + 1), ...suffix],
    straightSegments: [...state.straightSegments.filter((range) => range.start !== startIndex),
      { start: startIndex, end: startIndex + suffix.length }] }
}
