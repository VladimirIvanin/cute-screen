import type { JsonObject } from '@cute-screen/editor-renderer'
import { parseHexColor } from './color'

export type DrawingTool = 'arrow' | 'shape' | 'pencil' | 'marker'
export type DrawingControlId =
  | 'color'
  | 'width'
  | 'cornerRadius'
  | 'starPoints'
  | 'starInnerRatio'
  | 'shapeKind'
  | 'arrowPath'
  | 'startCap'
  | 'endCap'
  | 'strokeStyle'
  | 'brush'
  | 'markerMode'
  | 'layerOpacity'
  | 'blendMode'
  | 'fillKind'
  | 'fillOpacity'

const DRAWING_CONTROL_IDS = new Set<DrawingControlId>([
  'color',
  'width',
  'cornerRadius',
  'starPoints',
  'starInnerRatio',
  'shapeKind',
  'arrowPath',
  'startCap',
  'endCap',
  'strokeStyle',
  'brush',
  'markerMode',
  'layerOpacity',
  'blendMode',
  'fillKind',
  'fillOpacity',
])

export function isDrawingControlId(value: string): value is DrawingControlId {
  return DRAWING_CONTROL_IDS.has(value as DrawingControlId)
}

function layerPayload(
  id: DrawingControlId,
  value: string,
  current: JsonObject,
): JsonObject | undefined {
  if (id === 'layerOpacity') {
    const opacity = Number(value) / 100
    return Number.isFinite(opacity) && opacity >= 0 && opacity <= 1
      ? { ...current, layerOpacity: opacity }
      : undefined
  }
  if (id !== 'blendMode') return undefined
  const modes = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'softLight',
    'hardLight',
  ]
  return modes.includes(value) ? { ...current, blendMode: value } : undefined
}

function shapeKindPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  const shapes = ['rectangle', 'circle', 'oval', 'diamond', 'star']
  return tool === 'shape' && shapes.includes(value)
    ? { ...current, shape: value }
    : undefined
}

function arrowPathPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (
    tool !== 'arrow' ||
    (value !== 'straight' && value !== 'quadratic' && value !== 'elbow')
  ) {
    return undefined
  }
  const start = current.start as { readonly x?: unknown; readonly y?: unknown }
  const end = current.end as { readonly x?: unknown; readonly y?: unknown }
  const midpoint = {
    x:
      typeof start?.x === 'number' && typeof end?.x === 'number'
        ? (start.x + end.x) / 2
        : 0,
    y:
      typeof start?.y === 'number' && typeof end?.y === 'number'
        ? (start.y + end.y) / 2
        : 0,
  }
  const { bend: _bend, elbow: _elbow, ...pathIndependent } = current
  void _bend
  void _elbow
  if (value === 'quadratic') {
    return {
      ...pathIndependent,
      path: value,
      bend:
        current.bend && typeof current.bend === 'object'
          ? current.bend
          : midpoint,
    }
  }
  if (value === 'elbow') {
    return {
      ...pathIndependent,
      path: value,
      elbow:
        current.elbow && typeof current.elbow === 'object'
          ? current.elbow
          : { axis: 'y', offset: 0 },
    }
  }
  return { ...pathIndependent, path: value }
}

function arrowStylePayload(
  id: DrawingControlId,
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (tool !== 'arrow') return undefined
  if (id === 'startCap' || id === 'endCap') {
    const caps = [
      'none',
      'lineArrow',
      'solidArrow',
      'triangle',
      'circle',
      'diamond',
    ]
    return caps.includes(value) ? { ...current, [id]: value } : undefined
  }
  if (id !== 'strokeStyle') return undefined
  if (value !== 'solid' && value !== 'dashed' && value !== 'dotted') {
    return undefined
  }
  return {
    ...current,
    stroke: {
      ...(current.stroke as Record<string, unknown>),
      style: value,
    },
  }
}

function specializedPayload(
  id: DrawingControlId,
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (id === 'brush') {
    return tool === 'pencil' && ['pen', 'pencil', 'brush'].includes(value)
      ? { ...current, brush: value }
      : undefined
  }
  if (id !== 'markerMode') return undefined
  return tool === 'marker' && (value === 'highlight' || value === 'darken')
    ? { ...current, mode: value }
    : undefined
}

function fillKindPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (
    tool !== 'shape' ||
    !['none', 'solid', 'linearGradient', 'radialGradient'].includes(value)
  ) {
    return undefined
  }
  const candidate = (current.stroke as Record<string, unknown> | undefined)
    ?.color
  const color: JsonObject =
    candidate && typeof candidate === 'object'
      ? (candidate as JsonObject)
      : { red: 0.898, green: 0.282, blue: 0.302, alpha: 1 }
  if (value === 'none') return { ...current, fill: { kind: 'none' } }
  if (value === 'solid') {
    return { ...current, fill: { kind: 'solid', color, opacity: 1 } }
  }
  const stops = [
    { position: 0, color },
    { position: 1, color: { red: 1, green: 1, blue: 1, alpha: 0 } },
  ]
  return value === 'linearGradient'
    ? {
        ...current,
        fill: {
          kind: value,
          start: { x: 0, y: 0 },
          end: { x: 1, y: 1 },
          opacity: 1,
          stops,
        },
      }
    : {
        ...current,
        fill: {
          kind: value,
          center: { x: 0.5, y: 0.5 },
          radius: 0.5,
          opacity: 1,
          stops,
        },
      }
}

function fillOpacityPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  const opacity = Number(value) / 100
  const fill = current.fill
  if (
    tool !== 'shape' ||
    !Number.isFinite(opacity) ||
    opacity < 0 ||
    opacity > 1 ||
    !fill ||
    typeof fill !== 'object' ||
    (fill as Record<string, unknown>).kind === 'none'
  ) {
    return undefined
  }
  return { ...current, fill: { ...fill, opacity } }
}

function dimensionPayload(
  id: DrawingControlId,
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  const number = Number(value)
  if (!Number.isFinite(number)) return undefined
  if (id === 'cornerRadius') {
    return tool === 'shape' && number >= 0
      ? { ...current, cornerRadius: number }
      : undefined
  }
  if (id === 'starPoints') {
    return tool === 'shape' &&
      Number.isInteger(number) &&
      number >= 3 &&
      number <= 32
      ? { ...current, starPoints: number }
      : undefined
  }
  if (id === 'starInnerRatio') {
    return tool === 'shape' && number > 0 && number < 1
      ? { ...current, starInnerRatio: number }
      : undefined
  }
  if (id !== 'width' || number <= 0) return undefined
  return tool === 'arrow' || tool === 'shape'
    ? {
        ...current,
        stroke: {
          ...(current.stroke as Record<string, unknown>),
          width: number,
        },
      }
    : { ...current, width: number }
}

function colorPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  const color = parseHexColor(value)
  if (!color) return undefined
  return tool === 'arrow' || tool === 'shape'
    ? {
        ...current,
        stroke: { ...(current.stroke as Record<string, unknown>), color },
      }
    : { ...current, color }
}

export function resolveDrawingPayload(
  id: DrawingControlId,
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (id === 'layerOpacity' || id === 'blendMode') {
    return layerPayload(id, value, current)
  }
  if (id === 'shapeKind') return shapeKindPayload(value, tool, current)
  if (id === 'arrowPath') return arrowPathPayload(value, tool, current)
  if (id === 'startCap' || id === 'endCap' || id === 'strokeStyle') {
    return arrowStylePayload(id, value, tool, current)
  }
  if (id === 'brush' || id === 'markerMode') {
    return specializedPayload(id, value, tool, current)
  }
  if (id === 'fillKind') return fillKindPayload(value, tool, current)
  if (id === 'fillOpacity') return fillOpacityPayload(value, tool, current)
  if (
    id === 'width' ||
    id === 'cornerRadius' ||
    id === 'starPoints' ||
    id === 'starInnerRatio'
  ) {
    return dimensionPayload(id, value, tool, current)
  }
  return colorPayload(value, tool, current)
}
