import type { ShapePathCommand } from './shape-path-types'

type Point = Readonly<{ x: number; y: number }>

/** Stable identity-derived seed: creation previews and the committed layer share it. */
export function sketchSeed(id: string): number {
  let value = 2166136261
  for (const character of id) value = Math.imul(value ^ character.charCodeAt(0), 16777619)
  return (value >>> 0) || 1
}

export function sketchRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), state | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** Catmull–Rom to cubic Bézier, with optional endpoint tangents. */
export function smoothSketchPath(
  points: readonly Point[],
  tangents?: readonly [Point, Point],
): ShapePathCommand[] {
  const first = points[0]
  if (!first) return []
  const path: ShapePathCommand[] = [['M', first.x, first.y]]
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[Math.max(0, i - 1)]!
    const b = points[i]!
    const c = points[i + 1]!
    const d = points[Math.min(points.length - 1, i + 2)]!
    const start = i === 0 && tangents ? tangents[0] : { x: (c.x - a.x) / 6, y: (c.y - a.y) / 6 }
    const end = i === points.length - 2 && tangents ? tangents[1] : { x: (d.x - b.x) / 6, y: (d.y - b.y) / 6 }
    path.push(['C', b.x + start.x, b.y + start.y, c.x - end.x, c.y - end.y, c.x, c.y])
  }
  return path
}

/** One gently bowed stroke. Randomness is sampled only from the persisted seed. */
export function sketchPath(
  points: readonly Point[],
  seed: number,
  width: number,
  preserveCorners = false,
): readonly ShapePathCommand[] {
  if (points.length < 2) return smoothSketchPath(points)
  if (preserveCorners) {
    return points.slice(1).flatMap((end, i) => {
      const path = sketchPath([points[i]!, end], seed + i * 7919, width)
      return i === 0 ? [...path] : path.slice(1)
    })
  }
  const lengths = points.slice(1).map((end, i) => Math.hypot(end.x - points[i]!.x, end.y - points[i]!.y))
  const total = lengths.reduce((sum, length) => sum + length, 0)
  if (total < 0.01) return smoothSketchPath(points)
  const random = sketchRandom(seed)
  const phase = random() * Math.PI * 2
  const bow = (random() < 0.5 ? -1 : 1) * (0.55 + random() * 0.45)
  const amplitude = Math.min(6, total * 0.03, Math.max(1, width * 0.75))
  const samples: Point[] = []
  let distance = 0
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i]!, b = points[i + 1]!, length = lengths[i]!
    const steps = Math.max(1, Math.ceil(length / 24))
    for (let j = 0; j < steps; j++) {
      const fraction = j / steps
      const t = (distance + length * fraction) / total
      const offset = amplitude * Math.sin(Math.PI * t) ** 2 *
        (bow + 0.45 * Math.sin(t * Math.PI * 4 + phase))
      samples.push({
        x: a.x + (b.x - a.x) * fraction - (length ? (b.y - a.y) / length * offset : 0),
        y: a.y + (b.y - a.y) * fraction + (length ? (b.x - a.x) / length * offset : 0),
      })
    }
    distance += length
  }
  samples.push(points.at(-1)!)
  const first = samples[0]!, last = samples.at(-1)!
  const startDirection = points[1]!, endDirection = points.at(-2)!
  const startScale = Math.hypot(samples[1]!.x - first.x, samples[1]!.y - first.y) / 3 / Math.max(0.01, lengths[0]!)
  const endLength = Math.hypot(last.x - samples.at(-2)!.x, last.y - samples.at(-2)!.y)
  const endScale = endLength / 3 / Math.max(0.01, lengths.at(-1)!)
  return smoothSketchPath(samples, [
    { x: (startDirection.x - first.x) * startScale, y: (startDirection.y - first.y) * startScale },
    { x: (last.x - endDirection.x) * endScale, y: (last.y - endDirection.y) * endScale },
  ])
}

export function fitSketchPath(
  path: readonly ShapePathCommand[],
  width: number,
  height: number,
): readonly ShapePathCommand[] {
  const coordinates = path.flatMap((command) => command[0] === 'Z' ? [] :
      Array.from({ length: (command.length - 1) / 2 }, (_, i) => ({
        x: command[i * 2 + 1] as number, y: command[i * 2 + 2] as number,
      })))
  const left = Math.min(...coordinates.map((p) => p.x)), right = Math.max(...coordinates.map((p) => p.x))
  const top = Math.min(...coordinates.map((p) => p.y)), bottom = Math.max(...coordinates.map((p) => p.y))
  return path.map((command) => {
    if (command[0] === 'Z') return command
    const values = command.slice(1).map((value, i) => i % 2 === 0
      ? ((value as number) - left) * (width / (right - left))
      : ((value as number) - top) * (height / (bottom - top)))
    return command[0] === 'C' ? ['C', values[0]!, values[1]!, values[2]!, values[3]!, values[4]!, values[5]!] : [command[0], values[0]!, values[1]!]
  })
}
