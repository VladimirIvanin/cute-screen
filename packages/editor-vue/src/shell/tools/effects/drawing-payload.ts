import {
  changePencilBrush,
  isShapeKind,
  isHighlighterMode,
  type JsonObject,
  type FillPaint,
  type SrgbColor,
} from '@cute-screen/editor-renderer'
import { parseHexColor } from './color'
import {
  newLinearGradient,
  parseLinearGradient,
} from '../../ui/shape-gradient'

export type DrawingTool = 'arrow' | 'line' | 'shape' | 'pencil' | 'marker'
export type DrawingControlId =
  | 'autoAlignAxes'
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
  | 'arrowAppearance'
  | 'smoothing'
  | 'brush'
  | 'markerMode'
  | 'layerOpacity'
  | 'blendMode'
  | 'fillKind'
  | 'fillColor'
  | 'fillOpacity'
  | 'fillGradient'

const DRAWING_CONTROL_IDS = new Set<DrawingControlId>([
  'autoAlignAxes',
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
  'arrowAppearance',
  'smoothing',
  'brush',
  'markerMode',
  'layerOpacity',
  'blendMode',
  'fillKind',
  'fillColor',
  'fillOpacity',
  'fillGradient',
])

export function isDrawingControlId(value: string): value is DrawingControlId {
  return DRAWING_CONTROL_IDS.has(value as DrawingControlId)
}

function layerPayload(
  id: DrawingControlId,
  value: string,
  current: JsonObject,
): JsonObject | undefined {
  if (id === 'autoAlignAxes') return value === 'true' || value === 'false' ? { ...current, autoAlignAxes: value === 'true' } : undefined
  if (id === 'layerOpacity') {
    const opacity = Number(value) / 100
    return Number.isFinite(opacity) && opacity >= 0 && opacity <= 1 ? { ...current, layerOpacity: opacity } : undefined
  }
  if (id !== 'blendMode') return undefined
  const modes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'softLight', 'hardLight']
  return modes.includes(value) ? { ...current, blendMode: value } : undefined
}

function shapeKindPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (tool !== 'shape') return undefined
  if (value === 'roundedRectangle') return { ...current, shape: 'rectangle', cornerRadius: 12 }
  if (!isShapeKind(value)) return undefined
  return { ...current, shape: value, ...(['circling', 'rectangularCircling'].includes(String(value)) ? { fill: { kind: 'none' } } : {}), ...(value === 'rectangle' ? { cornerRadius: 0 } : {}) }
}

function arrowPathPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (
    tool !== 'arrow' ||
    (value !== 'straight' &&
      value !== 'quadratic' &&
      value !== 'elbow')
  ) {
    return undefined
  }
  const start = current.start as { readonly x?: unknown; readonly y?: unknown }
  const end = current.end as { readonly x?: unknown; readonly y?: unknown }
  const midpoint = {
    x: typeof start?.x === 'number' && typeof end?.x === 'number' ? (start.x + end.x) / 2 : 0,
    y: typeof start?.y === 'number' && typeof end?.y === 'number' ? (start.y + end.y) / 2 : 0,
  }
  const { bend: _bend, elbow: _elbow, ...pathIndependent } = current
  void _bend
  void _elbow
  if (value === 'quadratic') {
    return {
      ...pathIndependent,
      path: value,
      bend: current.bend && typeof current.bend === 'object' ? current.bend : midpoint,
    }
  }
  if (value === 'elbow') {
    return {
      ...pathIndependent,
      path: value,
      elbow: current.elbow && typeof current.elbow === 'object' ? current.elbow : { axis: 'y', offset: 0 },
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
  if (tool !== 'arrow' && !((tool === 'shape' || tool === 'line') && id === 'strokeStyle')) return undefined
  if (id === 'startCap' || id === 'endCap') {
    const caps = ['none', 'lineArrow', 'solidArrow', 'triangle', 'circle', 'diamond']
    return caps.includes(value) ? { ...current, [id]: value } : undefined
  }
  if (id !== 'strokeStyle') return undefined
  if (
    value !== 'solid' &&
    value !== 'dashed' &&
    value !== 'dotted'
  ) {
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
  if (id === 'smoothing') {
    const smoothing = Number(value) / 100
    if (
      tool !== 'pencil' ||
      !Number.isFinite(smoothing) ||
      smoothing < 0 ||
      smoothing > 1 ||
      current.brush === 'pen' &&
      (current.strokeVersion === 2 ||
        current.strokeVersion === 3)
    ) return undefined
    const memories = current.brushSmoothing as JsonObject | undefined
    return {
      ...current, smoothing,
      ...((current.strokeVersion === 2 || current.strokeVersion === 3)
        ? { brushSmoothing: { ...memories, [String(current.brush)]: smoothing } } : {}),
    }
  }
  if (id === 'brush') {
    return tool === 'pencil' && ['pen', 'stabilized'].includes(value) ? changePencilBrush(current, value) : undefined
  }
  if (id !== 'markerMode') return undefined
  if (tool !== 'marker' || !isHighlighterMode(value)) return undefined
  const { mode: _mode, blendMode: _blend, ...next } = current
  void _mode
  void _blend
  return { ...next, highlighterMode: value }
}

function fillKindPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (
    tool !== 'shape' ||
    !['none', 'solid', 'linearGradient'].includes(value) ||
    ['braceLeft', 'braceRight'].includes(String(current.shape))
  ) {
    return undefined
  }
  const previous = current.fill as FillPaint | undefined
  if (previous?.kind === value) return current
  const candidate = previous?.kind === 'solid' ? previous.color : (current.stroke as Record<string, unknown> | undefined)?.color
  const color: JsonObject =
    candidate && typeof candidate === 'object'
      ? (candidate as JsonObject)
      : { red: 0.898, green: 0.282, blue: 0.302, alpha: 1 }
  if (value === 'none') return { ...current, fill: { kind: 'none' } }
  if (value === 'solid') {
    return { ...current, fill: { kind: 'solid', color, opacity: 1 } }
  }
  const fill = newLinearGradient(previous ?? null, color as SrgbColor)
  return { ...current, fill: { ...fill, start: { ...fill.start }, end: { ...fill.end } } }
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
    return tool === 'shape' && number >= 0 ? { ...current, cornerRadius: number } : undefined
  }
  if (id === 'starPoints') {
    return tool === 'shape' && Number.isInteger(number) && number >= 3 && number <= 32
      ? { ...current, starPoints: number }
      : undefined
  }
  if (id === 'starInnerRatio') {
    return tool === 'shape' && number > 0 && number < 1 ? { ...current, starInnerRatio: number } : undefined
  }
  if (id !== 'width' || number <= 0) return undefined
  return tool === 'arrow' || tool === 'line' || tool === 'shape'
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
  return tool === 'arrow' || tool === 'line' || tool === 'shape'
    ? {
        ...current,
        stroke: { ...(current.stroke as Record<string, unknown>), color },
      }
    : { ...current, color }
}

function fillColorPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  const color = parseHexColor(value)
  if (tool !== 'shape' || !color) return undefined
  const fill = current.fill as Record<string, unknown> | undefined
  if (fill?.kind !== 'none' && fill?.kind !== 'solid') return undefined
  return { ...current, fill: { kind: 'solid', color, opacity: typeof fill?.opacity === 'number' ? fill.opacity : 1 } }
}

function fillGradientPayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (tool !== 'shape' || ['braceLeft', 'braceRight'].includes(String(current.shape))) return undefined
  const fill = parseLinearGradient(value)
  return fill ? { ...current, fill: { ...fill, start: { ...fill.start }, end: { ...fill.end } } } : undefined
}

function arrowAppearancePayload(
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  return tool === 'arrow' && (value === 'clean' || value === 'handDrawn')
    ? { ...current, appearance: value } : undefined
}

function blockedCirclingFill(
  id: DrawingControlId,
  tool: DrawingTool,
  current: JsonObject,
): boolean {
  return tool === 'shape' && ['circling', 'rectangularCircling'].includes(String(current.shape)) &&
    ['fillKind', 'fillColor', 'fillOpacity', 'fillGradient'].includes(id)
}

export function resolveDrawingPayload(
  id: DrawingControlId,
  value: string,
  tool: DrawingTool,
  current: JsonObject,
): JsonObject | undefined {
  if (
    id === 'autoAlignAxes' ||
    id === 'layerOpacity' ||
    id === 'blendMode'
  ) {
    return layerPayload(id, value, current)
  }
  if (id === 'arrowAppearance') return arrowAppearancePayload(value, tool, current)
  if (blockedCirclingFill(id, tool, current)) return undefined
  if (id === 'shapeKind') return shapeKindPayload(value, tool, current)
  if (id === 'arrowPath') return arrowPathPayload(value, tool, current)
  if (
    id === 'startCap' ||
    id === 'endCap' ||
    id === 'strokeStyle'
  ) {
    return arrowStylePayload(id, value, tool, current)
  }
  if (
    id === 'brush' ||
    id === 'markerMode' ||
    id === 'smoothing'
  ) {
    return specializedPayload(id, value, tool, current)
  }
  if (id === 'fillKind') return fillKindPayload(value, tool, current)
  if (id === 'fillGradient') return fillGradientPayload(value, tool, current)
  if (id === 'fillColor') return fillColorPayload(value, tool, current)
  if (id === 'fillOpacity') return fillOpacityPayload(value, tool, current)
  if (['width', 'cornerRadius', 'starPoints', 'starInnerRatio'].includes(id)) {
    return dimensionPayload(id, value, tool, current)
  }
  return colorPayload(value, tool, current)
}
