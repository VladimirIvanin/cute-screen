import {
  fitSketchPath,
  sketchRandom,
} from './sketch-geometry'
import type { ShapePathCommand } from './shape-path-types'

type Point = [number, number]
type Curve = [Point, Point, Point, Point]

function mix(
  a: Point,
  b: Point,
  t: number,
): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function split(
  curve: Curve,
  t: number,
): [Curve, Curve] {
  const a = mix(curve[0], curve[1], t), b = mix(curve[1], curve[2], t), c = mix(curve[2], curve[3], t)
  const d = mix(a, b, t), e = mix(b, c, t), f = mix(d, e, t)
  return [[curve[0], a, d, f], [f, e, c, curve[3]]]
}

function turn(
  a: Point,
  corner: Point,
  b: Point,
): Curve {
  return [a, mix(a, corner, 0.58), mix(b, corner, 0.58), b]
}

function bowedSide(
  a: Point,
  b: Point,
  limit: number,
  signed: () => number,
): Curve {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const bend = signed() * Math.min(length * 0.06, limit * 0.12)
  const c = mix(a, b, 0.32), d = mix(a, b, 0.7)
  const nx = -(b[1] - a[1]) / length, ny = (b[0] - a[0]) / length
  c[0] += nx * bend
  c[1] += ny * bend
  d[0] += nx * bend * 0.8
  d[1] += ny * bend * 0.8
  return [a, c, d, b]
}

/** One continuous loop with gently bowed sides and individually rounded corners. */
export function rectangularCirclingPath(
  width: number,
  height: number,
  seed: number,
): readonly ShapePathCommand[] {
  const random = sketchRandom(seed)
  const signed = () => random() - 0.5
  const minimum = Math.min(width, height)
  const jitter = minimum * 0.045
  const corners: [Point, Point, Point, Point] = [
    [jitter * signed(), jitter * signed()],
    [width + jitter * signed(), jitter * signed()],
    [width + jitter * signed(), height + jitter * signed()],
    [jitter * signed(), height + jitter * signed()],
  ]
  const radii = corners.map(() => minimum * (0.045 + random() * 0.105))
  const skew = signed() * height * 0.06
  corners[0][1] += skew
  corners[2][1] -= skew
  const [tl, tr, br, bl] = corners
  const [rtl, rtr, rbr, rbl] = radii as [number, number, number, number]
  const topRight: Point = [tr[0] - rtr, tr[1]], topLeft: Point = [tl[0] + rtl, tl[1]]
  const leftTop: Point = [tl[0], tl[1] + rtl], leftBottom: Point = [bl[0], bl[1] - rbl]
  const bottomLeft: Point = [bl[0] + rbl, bl[1]], bottomRight: Point = [br[0] - rbr, br[1]]
  const rightBottom: Point = [br[0], br[1] - rbr], rightTop: Point = [tr[0], tr[1] + rtr]
  const side = (a: Point, b: Point) => bowedSide(a, b, minimum, signed)
  const top = side(topRight, topLeft)
  const curves = [
    turn(topLeft, tl, leftTop), side(leftTop, leftBottom),
    turn(leftBottom, bl, bottomLeft), side(bottomLeft, bottomRight),
    turn(bottomRight, br, rightBottom), side(rightBottom, rightTop),
    turn(rightTop, tr, topRight),
  ]
  const start = 0.14 + random() * 0.35
  const overlap = 0.11 + random() * 0.13
  const beginning = split(top, start)[1], ending = split(top, start + overlap)[0]
  const lift = height * (0.025 + random() * 0.025)
  ending[1][1] -= lift * 0.15
  ending[2][1] -= lift * 0.65
  ending[3][1] -= lift
  const commands: ShapePathCommand[] = [['M', ...beginning[0]]]
  for (const curve of [beginning, ...curves, ending]) {
    commands.push(['C', ...curve[1], ...curve[2], ...curve[3]])
  }
  const reflectX = random() > 0.5, reflectY = random() < 0.3
  return fitSketchPath(commands.map((command) => reflect(command, width, height, reflectX, reflectY)), width, height)
}

function reflect(
  command: ShapePathCommand,
  width: number,
  height: number,
  reflectX: boolean,
  reflectY: boolean,
): ShapePathCommand {
  if (command[0] === 'Z') return command
  const point = (x: number, y: number): Point => [reflectX ? width - x : x, reflectY ? height - y : y]
  if (command[0] === 'C') return ['C', ...point(command[1], command[2]),
    ...point(command[3], command[4]), ...point(command[5], command[6])]
  return [command[0], ...point(command[1], command[2])]
}
