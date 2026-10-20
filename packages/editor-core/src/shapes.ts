import {
  circlingPath,
  rectangularCirclingPath,
} from './sketch-geometry'

import type { ShapePathCommand } from './shape-path-types'
export type { ShapePathCommand } from './shape-path-types'

type Point = Readonly<{ x: number; y: number }>

export const SHAPE_KINDS = [
  'rectangle', 'circle', 'oval', 'diamond', 'star', 'roundedDiamond', 'triangle', 'parallelogram',
  'trapezoid', 'pentagon', 'hexagon', 'octagon', 'cross', 'arrowLeft', 'arrowRight', 'arrowBoth',
  'chevron', 'pentagonRight', 'speechBubble', 'cloud', 'braceLeft', 'braceRight', 'cylinder', 'cube',
  'foldedDocument', 'ticket', 'shield', 'predefinedProcess', 'internalStorage', 'stackedCards', 'circling', 'rectangularCircling',
] as const
export type ShapeKind = typeof SHAPE_KINDS[number]

export interface ShapePreset {
  readonly id: string
  readonly shape: ShapeKind
  readonly en: string
  readonly ru: string
  readonly cornerRadius?: number
}

export const SHAPE_CATALOG: readonly ShapePreset[] = Object.freeze([
  { id: 'rectangle', shape: 'rectangle', en: 'Rectangle', ru: 'Прямоугольник' },
  { id: 'roundedRectangle', shape: 'rectangle', cornerRadius: 12, en: 'Rounded rectangle', ru: 'Скруглённый прямоугольник' },
  { id: 'circle', shape: 'circle', en: 'Circle', ru: 'Круг' },
  { id: 'diamond', shape: 'diamond', en: 'Diamond', ru: 'Ромб' },
  { id: 'triangle', shape: 'triangle', en: 'Triangle', ru: 'Треугольник' },
  { id: 'parallelogram', shape: 'parallelogram', en: 'Parallelogram', ru: 'Параллелограмм' },
  { id: 'cylinder', shape: 'cylinder', en: 'Cylinder', ru: 'Цилиндр' },
  { id: 'cross', shape: 'cross', en: 'Cross', ru: 'Крест' },
  { id: 'speechBubble', shape: 'speechBubble', en: 'Speech bubble', ru: 'Облачко речи' },
  { id: 'cloud', shape: 'cloud', en: 'Cloud', ru: 'Облако' },
  { id: 'star', shape: 'star', en: 'Star', ru: 'Звезда' },
  { id: 'braceLeft', shape: 'braceLeft', en: 'Left brace', ru: 'Левая фигурная скобка' },
  { id: 'braceRight', shape: 'braceRight', en: 'Right brace', ru: 'Правая фигурная скобка' },
  { id: 'arrowLeft', shape: 'arrowLeft', en: 'Left block arrow', ru: 'Блочная стрелка влево' },
  { id: 'arrowRight', shape: 'arrowRight', en: 'Right block arrow', ru: 'Блочная стрелка вправо' },
  { id: 'arrowBoth', shape: 'arrowBoth', en: 'Double block arrow', ru: 'Двусторонняя блочная стрелка' },
  { id: 'pentagon', shape: 'pentagon', en: 'Pentagon', ru: 'Пятиугольник' },
  { id: 'octagon', shape: 'octagon', en: 'Octagon', ru: 'Восьмиугольник' },
  { id: 'hexagon', shape: 'hexagon', en: 'Hexagon', ru: 'Шестиугольник' },
  { id: 'trapezoid', shape: 'trapezoid', en: 'Trapezoid', ru: 'Трапеция' },
  { id: 'predefinedProcess', shape: 'predefinedProcess', en: 'Predefined process', ru: 'Предопределённый процесс' },
  { id: 'oval', shape: 'oval', en: 'Oval', ru: 'Овал' },
  { id: 'internalStorage', shape: 'internalStorage', en: 'Internal storage', ru: 'Внутренняя память' },
  { id: 'foldedDocument', shape: 'foldedDocument', en: 'Folded document', ru: 'Лист с загнутым углом' },
  { id: 'ticket', shape: 'ticket', en: 'Ticket', ru: 'Билет' },
  { id: 'roundedDiamond', shape: 'roundedDiamond', en: 'Rounded diamond', ru: 'Скруглённый ромб' },
  { id: 'shield', shape: 'shield', en: 'Shield', ru: 'Щит' },
  { id: 'pentagonRight', shape: 'pentagonRight', en: 'Right pentagon', ru: 'Пятиугольник вправо' },
  { id: 'chevron', shape: 'chevron', en: 'Chevron', ru: 'Шеврон' },
  { id: 'stackedCards', shape: 'stackedCards', en: 'Stacked cards', ru: 'Стопка карточек' },
  { id: 'cube', shape: 'cube', en: 'Cube', ru: 'Куб' },
  { id: 'circling', shape: 'circling', en: 'Hand-drawn circle', ru: 'Овальная обводка' },
  { id: 'rectangularCircling', shape: 'rectangularCircling', en: 'Hand-drawn rectangle', ru: 'Прямоугольная обводка' },
].map((entry) => Object.freeze(entry)) as ShapePreset[])

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === 'string' && (SHAPE_KINDS as readonly string[]).includes(value)
}

export interface ShapeGeometry {
  readonly outline: readonly ShapePathCommand[]
  readonly details: readonly ShapePathCommand[]
  readonly open: boolean
}
interface Parameters {
  readonly sketchSeed?: number
  readonly sketchVersion?: 1
  readonly cornerRadius?: number
  readonly starPoints?: number
  readonly starInnerRatio?: number
}

function polygon(points: readonly (readonly [number, number])[]): ShapePathCommand[] {
  return [...points.map(([x, y], i): ShapePathCommand => [i ? 'L' : 'M', x, y]), ['Z']]
}
function regular(count: number): ShapePathCommand[] {
  return polygon(Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + i * Math.PI * 2 / count
    return [0.5 + Math.cos(angle) * 0.5, 0.5 + Math.sin(angle) * 0.5] as const
  }))
}
function rectangle(
  rx = 0,
  ry = rx,
): ShapePathCommand[] {
  const k = 0.5522847498307936
  return [
    ['M', rx, 0], ['L', 1 - rx, 0], ['C', 1 - rx + rx * k, 0, 1, ry - ry * k, 1, ry],
    ['L', 1, 1 - ry], ['C', 1, 1 - ry + ry * k, 1 - rx + rx * k, 1, 1 - rx, 1],
    ['L', rx, 1], ['C', rx - rx * k, 1, 0, 1 - ry + ry * k, 0, 1 - ry],
    ['L', 0, ry], ['C', 0, ry - ry * k, rx - rx * k, 0, rx, 0], ['Z'],
  ]
}
export function mapShapePath(
  path: readonly ShapePathCommand[],
  width: number,
  height: number,
  x = 0,
  y = 0,
): readonly ShapePathCommand[] {
  return path.map((command): ShapePathCommand => {
    if (command[0] === 'Z') return ['Z']
    if (command[0] === 'C') return ['C', x + command[1] * width, y + command[2] * height,
      x + command[3] * width, y + command[4] * height, x + command[5] * width, y + command[6] * height]
    return [command[0], x + command[1] * width, y + command[2] * height]
  })
}

function parameterizedOutline(
  kind: ShapeKind,
  width: number,
  height: number,
  parameters: Parameters,
): readonly ShapePathCommand[] | undefined {
  let outline: readonly ShapePathCommand[] | undefined
  switch (kind) {
    case 'rectangle': {
      const r = Math.max(0, Math.min(parameters.cornerRadius ?? 0, width / 2, height / 2))
      outline = rectangle(r / width, r / height)
      break
    }
    case 'circle':
    case 'oval': outline = rectangle(0.5, 0.5)
      break
    case 'star': {
      const count = Math.max(3, Math.min(32, Math.round(parameters.starPoints ?? 5)))
      const inner = Math.max(0.1, Math.min(0.9, parameters.starInnerRatio ?? 0.45))
      outline = polygon(Array.from({ length: count * 2 }, (_, i) => {
        const angle = -Math.PI / 2 + Math.PI * i / count
        const r = i % 2 ? inner / 2 : 0.5
        return [0.5 + Math.cos(angle) * r, 0.5 + Math.sin(angle) * r] as const
      }))
      break
    }
  }
  return outline
}

const SIMPLE_OUTLINES: Partial<Record<ShapeKind, readonly ShapePathCommand[]>> = {
  diamond: polygon([[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]]),
  triangle: polygon([[0.5, 0], [1, 1], [0, 1]]),
  parallelogram: polygon([[0.22, 0], [1, 0], [0.78, 1], [0, 1]]),
  trapezoid: polygon([[0.2, 0], [0.8, 0], [1, 1], [0, 1]]),
  pentagon: regular(5),
  hexagon: polygon([[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]]),
  octagon: polygon([[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]]),
  cross: polygon([
    [0.3, 0], [0.7, 0], [0.7, 0.3], [1, 0.3], [1, 0.7], [0.7, 0.7],
    [0.7, 1], [0.3, 1], [0.3, 0.7], [0, 0.7], [0, 0.3], [0.3, 0.3],
  ]),
  arrowBoth: polygon([
    [0, 0.5], [0.3, 0], [0.3, 0.3], [0.7, 0.3], [0.7, 0],
    [1, 0.5], [0.7, 1], [0.7, 0.7], [0.3, 0.7], [0.3, 1],
  ]),
  chevron: polygon([[0, 0], [0.65, 0], [1, 0.5], [0.65, 1], [0, 1], [0.35, 0.5]]),
  pentagonRight: polygon([[0, 0], [0.65, 0], [1, 0.5], [0.65, 1], [0, 1]]),
  speechBubble: polygon([[0, 0], [1, 0], [1, 0.75], [0.45, 0.75], [0.2, 1], [0.2, 0.75], [0, 0.75]]),
  shield: polygon([[0, 0], [1, 0], [1, 0.65], [0.5, 1], [0, 0.65]]),
}

const SKETCH_OUTLINES: Partial<Record<ShapeKind, typeof circlingPath>> = {
  circling: circlingPath,
  rectangularCircling: rectangularCirclingPath,
}

function sketchShapeGeometry(
  kind: ShapeKind,
  width: number,
  height: number,
  parameters: Parameters,
): ShapeGeometry | undefined {
  const generate = SKETCH_OUTLINES[kind]
  if (!generate) return undefined
  return { outline: generate(width, height, parameters.sketchSeed ?? 1), details: [], open: true }
}

/** Geometry is normalized, except that rectangle radius is supplied in document units. */
export function shapeGeometry(
  kind: ShapeKind,
  width = 1,
  height = 1,
  parameters: Parameters = {},
): ShapeGeometry {
  const sketch = sketchShapeGeometry(kind, width, height, parameters)
  if (sketch) return sketch
  const base = parameterizedOutline(kind, width, height, parameters) ?? SIMPLE_OUTLINES[kind]
  if (base) return { outline: mapShapePath(base, width, height), details: [], open: false }
  let outline: readonly ShapePathCommand[]
  let details: readonly ShapePathCommand[] = []
  let open = false
  switch (kind) {
    case 'roundedDiamond': outline = [
      ['M', 0.4, 0.06], ['C', 0.47, -0.02, 0.53, -0.02, 0.6, 0.06], ['L', 0.94, 0.4],
      ['C', 1.02, 0.47, 1.02, 0.53, 0.94, 0.6], ['L', 0.6, 0.94],
      ['C', 0.53, 1.02, 0.47, 1.02, 0.4, 0.94], ['L', 0.06, 0.6],
      ['C', -0.02, 0.53, -0.02, 0.47, 0.06, 0.4], ['Z'],
    ]
      break
    case 'arrowLeft':
    case 'arrowRight': {
      const path = polygon([[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]])
      outline = kind === 'arrowLeft' ? mapShapePath(path, -1, 1, 1, 0) : path
      break
    }
    case 'cloud': outline = [
      ['M', 0.18, 0.8], ['C', 0, 0.8, 0, 0.43, 0.13, 0.4],
      ['C', 0.03, 0.12, 0.35, 0, 0.49, 0.16], ['C', 0.65, 0, 0.94, 0.06, 0.9, 0.32],
      ['C', 1, 0.34, 1, 0.68, 0.9, 0.71], ['C', 0.95, 0.99, 0.61, 1, 0.48, 0.88],
      ['C', 0.35, 1, 0.12, 1, 0.18, 0.8], ['Z'],
    ]
      break
    case 'braceLeft':
    case 'braceRight': {
      const path: ShapePathCommand[] = [
        ['M', 1, 0], ['C', 0.1, 0, 0.7, 0.42, 0, 0.5], ['C', 0.7, 0.58, 0.1, 1, 1, 1],
      ]
      outline = kind === 'braceRight' ? mapShapePath(path, -1, 1, 1, 0) : path
      open = true
      break
    }
    case 'cylinder': outline = [
      ['M', 0, 0.15], ['C', 0, -0.05, 1, -0.05, 1, 0.15], ['L', 1, 0.85],
      ['C', 1, 1.05, 0, 1.05, 0, 0.85], ['Z'],
    ]
      details = [['M', 0, 0.15], ['C', 0, 0.35, 1, 0.35, 1, 0.15]]
      break
    case 'cube': outline = polygon([[0.25, 0], [1, 0], [1, 0.75], [0.75, 1], [0, 1], [0, 0.25]])
      details = [['M', 0, 0.25], ['L', 0.75, 0.25], ['L', 1, 0], ['M', 0.75, 0.25], ['L', 0.75, 1]]
      break
    case 'foldedDocument': outline = polygon([[0, 0], [0.7, 0], [1, 0.3], [1, 1], [0, 1]])
      details = [['M', 0.7, 0], ['L', 0.7, 0.3], ['L', 1, 0.3]]
      break
    case 'ticket': outline = [
      ['M', 0, 0], ['L', 1, 0], ['L', 1, 0.3], ['C', 0.72, 0.3, 0.72, 0.7, 1, 0.7],
      ['L', 1, 1], ['L', 0, 1], ['L', 0, 0.7], ['C', 0.28, 0.7, 0.28, 0.3, 0, 0.3], ['Z'],
    ]
      break
    case 'predefinedProcess': outline = rectangle()
      details = [['M', 0.2, 0], ['L', 0.2, 1], ['M', 0.8, 0], ['L', 0.8, 1]]
      break
    case 'internalStorage': outline = rectangle()
      details = [['M', 0.2, 0], ['L', 0.2, 1], ['M', 0, 0.2], ['L', 1, 0.2]]
      break
    case 'stackedCards': outline = polygon([[0.16, 0], [1, 0], [1, 0.84], [0.84, 0.84], [0.84, 1], [0, 1], [0, 0.16], [0.16, 0.16]])
      details = [['M', 0, 0.16], ['L', 0.84, 0.16], ['L', 0.84, 0.84], ['L', 1, 0.84]]
      break
    default: throw new Error(`Unsupported shape: ${kind}`)
  }
  return { outline: mapShapePath(outline, width, height), details: mapShapePath(details, width, height), open }
}

export function shapePathSvg(path: readonly ShapePathCommand[]): string {
  return path.map((command) => command.join(' ')).join(' ')
}

/** Adaptive cubic flattening for DOM-free hit testing, in document pixels. */
export function flattenShapePath(
  path: readonly ShapePathCommand[],
  tolerance = 0.2,
): readonly (readonly Point[])[] {
  const contours: Point[][] = []
  let points: Point[] = []
  let current: Point = { x: 0, y: 0 }
  function cubic(
    a: Point,
    b: Point,
    c: Point,
    d: Point,
    depth: number,
  ): void {
    const ux = 3 * b.x - 2 * a.x - d.x
    const uy = 3 * b.y - 2 * a.y - d.y
    const vx = 3 * c.x - 2 * d.x - a.x
    const vy = 3 * c.y - 2 * d.y - a.y
    if (depth >= 12 || Math.max(ux * ux + uy * uy, vx * vx + vy * vy) <= 16 * tolerance * tolerance) {
      points.push(d)
      return
    }
    const midpoint = (p: Point, q: Point): Point => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
    const ab = midpoint(a, b), bc = midpoint(b, c), cd = midpoint(c, d)
    const abc = midpoint(ab, bc), bcd = midpoint(bc, cd), center = midpoint(abc, bcd)
    cubic(a, ab, abc, center, depth + 1)
    cubic(center, bcd, cd, d, depth + 1)
  }
  for (const command of path) {
    if (command[0] === 'Z') {
      if (points[0]) points.push(points[0])
      continue
    }
    if (command[0] === 'C') {
      const end = { x: command[5], y: command[6] }
      cubic(current, { x: command[1], y: command[2] }, { x: command[3], y: command[4] }, end, 0)
      current = end
      continue
    }
    current = { x: command[1], y: command[2] }
    if (command[0] === 'M') {
      points = []
      contours.push(points)
    }
    points.push(current)
  }
  return contours
}
