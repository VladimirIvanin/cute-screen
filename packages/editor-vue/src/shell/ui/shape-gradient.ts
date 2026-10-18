import type {
  FillPaint,
  GradientStop,
  SrgbColor,
} from '@cute-screen/editor-renderer'

export type LinearFill = Extract<FillPaint, { kind: 'linearGradient' }>
export type { GradientStop } from '@cute-screen/editor-renderer'

export function gradientAngle(fill: LinearFill): number {
  return (Math.round(Math.atan2(fill.end.y - fill.start.y, fill.end.x - fill.start.x) * 180 / Math.PI) + 360) % 360
}

export function angleGradient(
  fill: LinearFill,
  angle: number,
): LinearFill {
  const radians = angle * Math.PI / 180
  const x = Math.cos(radians), y = Math.sin(radians)
  const half = 0.5 / Math.max(Math.abs(x), Math.abs(y))
  return { ...fill, start: { x: 0.5 - x * half, y: 0.5 - y * half }, end: { x: 0.5 + x * half, y: 0.5 + y * half } }
}

export function reverseGradient(fill: LinearFill): LinearFill {
  return { ...fill, stops: [...fill.stops].reverse().map((stop) => ({ ...stop, position: 1 - stop.position })) }
}

export function newLinearGradient(
  fill: FillPaint | null,
  fallback: SrgbColor,
): LinearFill {
  if (fill?.kind === 'linearGradient') return fill
  if (fill?.kind === 'radialGradient') return {
    kind: 'linearGradient', start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, opacity: fill.opacity, stops: fill.stops,
  }
  const color = fill?.kind === 'solid' ? fill.color : fallback
  return {
    kind: 'linearGradient', start: { x: 0, y: 0 }, end: { x: 1, y: 1 },
    opacity: fill && fill.kind !== 'none' ? fill.opacity : 1,
    stops: [{ position: 0, color }, { position: 1, color: { ...color, alpha: 0 } }],
  }
}

export function interpolateStop(
  stops: readonly GradientStop[],
  position: number,
): GradientStop {
  const right = stops.find((stop) => stop.position >= position) ?? stops[stops.length - 1]!
  const left = [...stops].reverse().find((stop) => stop.position <= position) ?? stops[0]!
  const ratio = right.position === left.position ? 0 : (position - left.position) / (right.position - left.position)
  const blend = (key: keyof SrgbColor) =>
    Number(left.color[key]) + (Number(right.color[key]) - Number(left.color[key])) * ratio
  return { position, color: { red: blend('red'), green: blend('green'), blue: blend('blue'), alpha: blend('alpha') } }
}

export function colorCss(color: SrgbColor): string {
  return `rgba(${color.red * 255}, ${color.green * 255}, ${color.blue * 255}, ${color.alpha})`
}

export function gradientStrip(fill: LinearFill): string {
  return `linear-gradient(90deg, ${fill.stops.map((stop) => `${colorCss(stop.color)} ${stop.position * 100}%`).join(', ')})`
}

/** Invalid drafts never enter defaults or a document command. */
export function parseLinearGradient(value: string): LinearFill | undefined {
  let input: unknown
  try {
    input = JSON.parse(value)
  } catch {
    return undefined
  }
  if (!input || typeof input !== 'object') return undefined
  const fill = input as LinearFill
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
  const unit = (n: unknown): n is number => finite(n) && n >= 0 && n <= 1
  const point = (p: LinearFill['start']) => p && finite(p.x) && finite(p.y)
  if (
    fill.kind !== 'linearGradient' ||
    !unit(fill.opacity) ||
    !point(fill.start) ||
    !point(fill.end) ||
    (fill.start.x === fill.end.x &&
      fill.start.y === fill.end.y) ||
      !Array.isArray(fill.stops) ||
      fill.stops.length < 2 ||
      fill.stops.length > 8
  ) return undefined
  let previous = -1
  for (const stop of fill.stops) {
    if (
      !stop ||
      !unit(stop.position) ||
      stop.position < previous ||
      !stop.color ||
      !['red', 'green', 'blue', 'alpha'].every((key) => unit(stop.color[key]))
    ) return undefined
    previous = stop.position
  }
  return { kind: 'linearGradient', opacity: fill.opacity,
    start: { x: fill.start.x, y: fill.start.y }, end: { x: fill.end.x, y: fill.end.y },
    stops: fill.stops.map((stop) => ({ position: stop.position, color: {
      red: stop.color.red, green: stop.color.green, blue: stop.color.blue, alpha: stop.color.alpha,
    } })),
  }
}
