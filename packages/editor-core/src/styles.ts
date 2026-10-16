import {
  rebaseFreehandLayer,
  changePencilBrush,
} from './tools/freehand'
import type { EditorCommand } from './commands/types'
import type {
  JsonObject,
  JsonValue,
  LayerNode,
  RichTextContent,
} from './document/types'
import { rebaseArrowLayer } from './arrow-geometry'
import { rebaseCalloutLayer } from './callout-geometry'
import { rebaseRulerLayer } from './tools/precision/ruler'

/** Semantic visual channels. Geometry and content are never style channels. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
type MutableObject = Record<string, JsonValue>
export type LayerStyle = Readonly<Record<string, JsonValue>>
const channels: Partial<Record<LayerNode['kind'], Readonly<Record<string, string>>>> = {
  arrow: {
    color: 'stroke.color',
    width: 'stroke.width',
    strokeStyle: 'stroke.style',
    startCap: 'startCap',
    endCap: 'endCap',
  },
  shape: {
    color: 'stroke.color',
    width: 'stroke.width',
    strokeStyle: 'stroke.style',
    fill: 'fill',
    cornerRadius: 'cornerRadius',
  },
  pencil: {
    color: 'color',
    width: 'width',
    brush: 'brush',
    smoothing: 'smoothing',
  },
  marker: { color: 'color', width: 'width', smoothing: 'smoothing', highlighterMode: 'highlighterMode' },
  text: { background: 'background' },
  callout: {
    color: 'stroke.color',
    width: 'stroke.width',
    strokeStyle: 'stroke.style',
    background: 'background',
  },
  numberedMarker: { badgeColor: 'badge.color', badgeShape: 'badge.shape' },
  image: { imageBorder: 'border', radius: 'radius' },
  censor: { effect: 'effect' },
  spotlight: {
    dimColor: 'dimColor',
    dimOpacity: 'dimOpacity',
    feather: 'feather',
  },
  ruler: { color: 'color', width: 'thickness', fontSize: 'fontSize' },
  loupe: { zoom: 'zoom', lensBorder: 'border', shadow: 'shadow' },
}
const spanKeys = ['fontFamily', 'fontSize', 'textColor', 'weight', 'italic', 'strikethrough'] as const
const paragraphKeys = ['alignment', 'listKind'] as const
function contentFor(layer: LayerNode): RichTextContent | undefined {
  if (layer.kind === 'numberedMarker') return layer.payload.label
  if (layer.kind === 'text' || layer.kind === 'callout') return layer.payload.content
  return undefined
}
function readPath(
  payload: JsonObject,
  path: string,
): JsonValue | undefined {
  let value: unknown = payload
  for (const key of path.split('.')) value = value && typeof value === 'object' ? (value as JsonObject)[key] : undefined
  return value as JsonValue | undefined
}
function writePath(
  payload: JsonObject,
  path: string,
  value: JsonValue,
): void {
  const keys = path.split('.')
  let object = payload
  for (const key of keys.slice(0, -1)) object = object[key] as JsonObject
  ;
  (object as MutableObject)[keys[keys.length - 1]!] = clone(value)
}
export function creationPolicy(tool: string): 'repeat' | 'select' {
  return ['numberedMarker', 'pencil', 'marker'].includes(tool) ? 'repeat' : 'select'
}
export function extractLayerStyle(layer: LayerNode): LayerStyle {
  const result: Record<string, JsonValue> = {}
  for (const [key, path] of Object.entries(channels[layer.kind] ?? {})) {
    const value = readPath(layer.payload, path)
    if (value !== undefined) result[key] = clone(value)
  }
  if ('opacity' in layer) {
    result.opacity = layer.opacity
    result.blendMode = layer.blendMode
    result.shadows = clone(layer.shadows) as unknown as JsonValue
  }
  const content = contentFor(layer)
  if (content) {
    for (const key of [...spanKeys, ...paragraphKeys]) {
      const records = (paragraphKeys as readonly string[]).includes(key) ? content.paragraphs : content.spans
      const field = key === 'textColor' ? 'color' : key
      const values = records.map((record) => (record as unknown as JsonObject)[field])
      const first = values[0]
      if (first !== undefined && values.every((value) => JSON.stringify(value) === JSON.stringify(first)))
        result[key] = clone(first)
    }
  }
  return result
}
export function commonLayerStyle(layers: readonly LayerNode[]): Readonly<Record<string, JsonValue | null>> {
  const styles = layers.map(extractLayerStyle)
  const first = styles[0]
  if (!first) return {}
  const result: Record<string, JsonValue | null> = {}
  for (const [key, value] of Object.entries(first)) {
    if (styles.every((style) => key in style))
      result[key] = styles.every((style) => JSON.stringify(style[key]) === JSON.stringify(value)) ? value : null
  }
  return result
}
function boundedStyle(
  layer: LayerNode,
  style: LayerStyle,
): LayerStyle {
  if (layer.kind === 'ruler') {
    const bounded = { ...style }
    if (
      typeof bounded.width === 'number' &&
      (!Number.isInteger(bounded.width) ||
        bounded.width < 1 ||
        bounded.width > 12)
    )
      delete bounded.width
    if (
      typeof bounded.fontSize === 'number' &&
      (!Number.isInteger(bounded.fontSize) ||
        bounded.fontSize < 10 ||
        bounded.fontSize > 48)
    )
      delete bounded.fontSize
    return bounded
  }
  return style
}

function styledContent(
  content: RichTextContent,
  style: LayerStyle,
): JsonObject {
  {
    const spans = content.spans.map((span) => {
      const next = { ...span } as unknown as MutableObject
      for (const key of spanKeys) if (key in style) next[key === 'textColor' ? 'color' : key] = clone(style[key]!)
      return next
    })
    const paragraphs = content.paragraphs.map((paragraph) => {
      const next = { ...paragraph } as unknown as MutableObject
      for (const key of paragraphKeys) if (key in style) next[key] = clone(style[key]!)
      return next
    })
    return {
      ...content,
      spans,
      paragraphs,
    } as unknown as JsonObject
  }
}

export function applyLayerStyle<T extends LayerNode>(
  layer: T,
  style: LayerStyle,
  canvas?: { readonly width: number; readonly height: number },
): T {
  style = boundedStyle(layer, style)
  const source = layer.kind === 'pencil' && typeof style.brush === 'string'
    ? changePencilBrush(layer.payload, style.brush) : layer.payload
  const payload = clone(source) as MutableObject
  delete payload.brushSmoothing
  for (const [key, path] of Object.entries(channels[layer.kind] ?? {})) {
    if (key in style) writePath(payload, path, key === 'brush' && style[key] === 'pencil' ? 'pen' : style[key]!)
  }
  const content = contentFor(layer)
  if (content) payload[layer.kind === 'numberedMarker' ? 'label' : 'content'] = styledContent(content, style)
  let next = { ...layer, payload } as LayerNode
  if ('opacity' in next)
    next = {
      ...next,
      ...Object.fromEntries(
        ['opacity', 'blendMode', 'shadows'].filter((key) => key in style).map((key) => [key, clone(style[key])]),
      ),
    }
  if (
    next.kind === 'loupe' &&
    layer.kind === 'loupe' &&
    next.payload.zoom !== layer.payload.zoom
  ) {
    const region = next.payload.sourceRegion
    const size = next.payload.lens.size / next.payload.zoom
    next = {
      ...next,
      payload: {
        ...next.payload,
        sourceRegion: {
          x: region.x + (region.width - size) / 2,
          y: region.y + (region.height - size) / 2,
          width: size,
          height: size,
        },
      },
    }
  }
  if (next.kind === 'pencil' || next.kind === 'marker') next = rebaseFreehandLayer(next)
  if (next.kind === 'arrow' && JSON.stringify(next.payload) !== JSON.stringify(layer.payload))
    next = rebaseArrowLayer(next, next.payload)
  if (next.kind === 'callout' && JSON.stringify(next.payload) !== JSON.stringify(layer.payload))
    next = rebaseCalloutLayer(next, next.payload)
  if (next.kind === 'ruler' && JSON.stringify(next.payload) !== JSON.stringify(layer.payload)) {
    if (!canvas) throw new Error('Ruler style changes require the document canvas')
    next = rebaseRulerLayer(next, next.payload, canvas)
  }
  return next as T
}
/** Locked groups are all-or-nothing, and no-ops never enter history. */
export function styleCommand(
  layers: readonly LayerNode[],
  style: LayerStyle,
  canvas?: { readonly width: number; readonly height: number },
): EditorCommand | null {
  if (!layers.length || layers.some((layer) => layer.locked)) return null
  const commands: EditorCommand[] = layers.flatMap((before) => {
    const after = applyLayerStyle(before, style, canvas)
    return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ type: 'updateLayer' as const, before, after }]
  })
  return commands.length === 1 ? commands[0]! : commands.length ? { type: 'batch', commands } : null
}
