import type {
  ArrowCap,
  ArrowLayer,
  ArrowLayerPayload,
  JsonObject,
  LayerNode,
  Point,
  Rect,
  Transform2D,
} from './document/types'
import { rebaseArrowLayer } from './arrow-geometry'

export type DrawingTool = 'arrow' | 'shape' | 'pencil' | 'marker'
export type ShapeKind = 'rectangle' | 'circle' | 'oval' | 'diamond' | 'star'

export interface DrawingDefaults {
  readonly arrow: JsonObject
  readonly shape: JsonObject
  readonly pencil: JsonObject
  readonly marker: JsonObject
}

interface DrawingLayerInput {
  readonly id: string
  readonly tool: DrawingTool
  readonly start: Point
  readonly end: Point
  readonly defaults?: DrawingDefaults
  readonly constrainAngle?: boolean
  readonly drawFromCenter?: boolean
  readonly points?: readonly (Point &
    Readonly<{ readonly pressure?: number }>)[]
}

export const DEFAULT_DRAWING_DEFAULTS: DrawingDefaults = Object.freeze({
  arrow: Object.freeze({
    path: 'straight',
    stroke: Object.freeze({
      color: Object.freeze({ red: 0.898, green: 0.282, blue: 0.302, alpha: 1 }),
      width: 3,
      style: 'solid',
      cap: 'round',
      join: 'round',
    }),
    startCap: 'none',
    endCap: 'solidArrow',
  }),
  shape: Object.freeze({
    shape: 'rectangle',
    fill: Object.freeze({ kind: 'none' }),
    stroke: Object.freeze({
      color: Object.freeze({ red: 0.898, green: 0.282, blue: 0.302, alpha: 1 }),
      width: 3,
      style: 'solid',
      cap: 'round',
      join: 'round',
    }),
    cornerRadius: 0,
    starPoints: 5,
    starInnerRatio: 0.45,
  }),
  pencil: Object.freeze({
    brush: 'pen',
    width: 3,
    color: Object.freeze({ red: 0.898, green: 0.282, blue: 0.302, alpha: 1 }),
    smoothing: 0.5,
  }),
  marker: Object.freeze({
    width: 18,
    color: Object.freeze({ red: 1, green: 0.835, blue: 0.29, alpha: 1 }),
    smoothing: 0.5,
    mode: 'highlight',
  }),
})

const IDENTITY_TRANSFORM: Transform2D = Object.freeze({
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
})

function constrainedEnd(start: Point, end: Point, constrained: boolean): Point {
  if (!constrained) return end
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return end
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
  return Object.freeze({
    x: start.x + Math.cos(angle) * length,
    y: start.y + Math.sin(angle) * length,
  })
}

function constrainedShapeEnd(start: Point, end: Point): Point {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return Object.freeze({
    x: start.x + (dx < 0 ? -side : side),
    y: start.y + (dy < 0 ? -side : side),
  })
}

function bounds(start: Point, end: Point, minimum = 1, inset = 0): Rect {
  return Object.freeze({
    x: Math.min(start.x, end.x) - inset,
    y: Math.min(start.y, end.y) - inset,
    width: Math.max(minimum, Math.abs(end.x - start.x) + inset * 2),
    height: Math.max(minimum, Math.abs(end.y - start.y) + inset * 2),
  })
}

function pointsBounds(points: readonly Point[], inset = 0): Rect {
  const first = points[0]
  if (!first) return bounds({ x: 0, y: 0 }, { x: 0, y: 0 })
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return Object.freeze({
    x: Math.min(...xs) - inset,
    y: Math.min(...ys) - inset,
    width: Math.max(1, Math.max(...xs) - Math.min(...xs) + inset * 2),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys) + inset * 2),
  })
}

function positiveWidth(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : fallback
}

function layerOpacity(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback
}

function layerBlendMode(
  value: unknown,
):
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'softLight'
  | 'hardLight' {
  return [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'softLight',
    'hardLight',
  ].includes(value as string)
    ? (value as ReturnType<typeof layerBlendMode>)
    : 'normal'
}

function drawingEnd(input: DrawingLayerInput, shape: string): Point {
  if (input.tool === 'arrow')
    return constrainedEnd(input.start, input.end, input.constrainAngle === true)
  if (
    input.tool === 'shape' &&
    (input.constrainAngle === true || shape === 'circle')
  )
    return constrainedShapeEnd(input.start, input.end)
  return input.end
}

function drawingStrokeWidth(
  input: DrawingLayerInput,
  defaults: DrawingDefaults,
): number {
  if (input.tool === 'pencil' || input.tool === 'marker') {
    const values = input.tool === 'pencil' ? defaults.pencil : defaults.marker
    return positiveWidth(values.width, input.tool === 'marker' ? 18 : 3)
  }
  const values = input.tool === 'arrow' ? defaults.arrow : defaults.shape
  const strokeValue =
    values.stroke instanceof Object
      ? (values.stroke as JsonObject).width
      : undefined
  return positiveWidth(strokeValue, 3)
}

function drawingGeometry(
  input: DrawingLayerInput,
  end: Point,
  samples: readonly Point[],
  strokeWidth: number,
): Rect {
  if (input.tool === 'pencil' || input.tool === 'marker')
    return pointsBounds(samples, strokeWidth / 2)
  if (input.tool === 'arrow') return bounds({ x: 0, y: 0 }, { x: 0, y: 0 })
  if (input.drawFromCenter)
    return bounds(
      { x: input.start.x * 2 - end.x, y: input.start.y * 2 - end.y },
      end,
      1,
      strokeWidth / 2,
    )
  return bounds(input.start, end, 1, strokeWidth / 2)
}

function commonDrawingLayer(
  input: DrawingLayerInput,
  defaults: DrawingDefaults,
  geometry: Rect,
) {
  const layerDefaults = defaults[input.tool]
  const markerBlend = defaults.marker.mode === 'darken' ? 'darken' : 'multiply'
  return {
    id: input.id,
    transform: {
      ...IDENTITY_TRANSFORM,
      translateX: geometry.x,
      translateY: geometry.y,
    },
    localBounds: { x: 0, y: 0, width: geometry.width, height: geometry.height },
    opacity: layerOpacity(
      layerDefaults.layerOpacity,
      input.tool === 'marker' ? 0.35 : 1,
    ),
    visible: true,
    locked: false,
    blendMode:
      input.tool === 'marker'
        ? markerBlend
        : layerBlendMode(layerDefaults.blendMode),
    shadows: [],
  } as const
}

function arrowCap(value: unknown, fallback: ArrowCap): ArrowCap {
  const caps: readonly ArrowCap[] = [
    'none',
    'lineArrow',
    'solidArrow',
    'triangle',
    'circle',
    'diamond',
  ]
  return caps.includes(value as ArrowCap) ? (value as ArrowCap) : fallback
}

function createArrowDrawing(
  input: DrawingLayerInput,
  defaults: DrawingDefaults,
  end: Point,
  common: ReturnType<typeof commonDrawingLayer>,
): ArrowLayer {
  const requestedPath = defaults.arrow.path
  const path =
    requestedPath === 'quadratic' || requestedPath === 'elbow'
      ? requestedPath
      : 'straight'
  const requestedElbow =
    defaults.arrow.elbow &&
    typeof defaults.arrow.elbow === 'object' &&
    !Array.isArray(defaults.arrow.elbow)
      ? (defaults.arrow.elbow as JsonObject)
      : undefined
  const elbow =
    path === 'elbow'
      ? {
          axis: requestedElbow?.axis === 'x' ? ('x' as const) : ('y' as const),
          offset:
            typeof requestedElbow?.offset === 'number' &&
            Number.isFinite(requestedElbow.offset)
              ? requestedElbow.offset
              : 0,
        }
      : undefined
  const arrowStyle = { ...defaults.arrow }
  delete arrowStyle.bend
  delete arrowStyle.elbow
  delete arrowStyle.end
  delete arrowStyle.start
  const payload: ArrowLayerPayload = {
    ...arrowStyle,
    path,
    start: { x: input.start.x, y: input.start.y },
    end: { x: end.x, y: end.y },
    stroke: defaults.arrow.stroke as ArrowLayerPayload['stroke'],
    startCap: arrowCap(defaults.arrow.startCap, 'none'),
    endCap: arrowCap(defaults.arrow.endCap, 'solidArrow'),
    ...(path === 'quadratic'
      ? {
          bend: {
            x: (input.start.x + end.x) / 2,
            y:
              (input.start.y + end.y) / 2 -
              Math.max(
                8,
                Math.hypot(end.x - input.start.x, end.y - input.start.y) / 4,
              ),
          },
        }
      : {}),
    ...(elbow ? { elbow } : {}),
  }
  const seed: ArrowLayer = {
    ...common,
    kind: 'arrow',
    transform: IDENTITY_TRANSFORM,
    localBounds: { x: 0, y: 0, width: 1, height: 1 },
    payload,
  }
  return rebaseArrowLayer(seed, payload)
}

function createFreehandDrawing(
  input: DrawingLayerInput,
  defaults: DrawingDefaults,
  samples: readonly (Point & Readonly<{ readonly pressure?: number }>)[],
  geometry: Rect,
  common: ReturnType<typeof commonDrawingLayer>,
): LayerNode {
  const values = input.tool === 'pencil' ? defaults.pencil : defaults.marker
  return Object.freeze({
    ...common,
    kind: input.tool,
    payload: {
      ...values,
      points: simplifySampledPoints(
        samples.map((point) => ({
          x: point.x - geometry.x,
          y: point.y - geometry.y,
          pressure:
            typeof point.pressure === 'number' &&
            Number.isFinite(point.pressure)
              ? Math.max(0, Math.min(1, point.pressure))
              : 0.5,
        })),
      ),
    },
  }) as LayerNode
}

/** Builds one current drawing layer; callers only commit it on pointer-up. */
export function createDrawingLayer(
  input: DrawingLayerInput,
): LayerNode | undefined {
  const defaults = input.defaults ?? DEFAULT_DRAWING_DEFAULTS
  const requestedShape = defaults.shape.shape
  const shape =
    typeof requestedShape === 'string' ? requestedShape : 'rectangle'
  const end = drawingEnd(input, shape)
  if (
    input.tool !== 'pencil' &&
    input.tool !== 'marker' &&
    end.x === input.start.x &&
    end.y === input.start.y
  ) {
    return undefined
  }
  const samples: readonly (Point & Readonly<{ readonly pressure?: number }>)[] =
    input.points?.length ? input.points : [input.start, end]
  const strokeWidth = drawingStrokeWidth(input, defaults)
  const geometry = drawingGeometry(input, end, samples, strokeWidth)
  const common = commonDrawingLayer(input, defaults, geometry)
  if (input.tool === 'arrow')
    return createArrowDrawing(input, defaults, end, common)
  if (input.tool === 'shape') {
    const square = shape === 'circle'
    const side = Math.max(geometry.width, geometry.height)
    return Object.freeze({
      ...common,
      localBounds: square
        ? { x: 0, y: 0, width: side, height: side }
        : common.localBounds,
      kind: 'shape' as const,
      payload: { ...defaults.shape, shape },
    })
  }
  return createFreehandDrawing(input, defaults, samples, geometry, common)
}

/** Keeps the first/last sample while removing points closer than the tolerance. */
export function simplifySampledPoints(
  points: readonly {
    readonly x: number
    readonly y: number
    readonly pressure: number
  }[],
  tolerance = 0.5,
): readonly {
  readonly x: number
  readonly y: number
  readonly pressure: number
}[] {
  if (points.length <= 2) return Object.freeze([...points])
  const result = [points[0]!]
  for (const point of points.slice(1, -1)) {
    const previous = result[result.length - 1]!
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= tolerance)
      result.push(point)
  }
  result.push(points[points.length - 1]!)
  return Object.freeze(result)
}
