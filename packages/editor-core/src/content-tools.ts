import { parseEditorDocument } from './document/codec'
import type { EditorCommand } from './commands/types'
import type {
  CalloutLayer,
  BlendMode,
  EmojiAssetReference,
  EmojiLayer,
  FontReference,
  ImageLayer,
  JsonObject,
  LayerNode,
  NumberedMarkerLayer,
  Point,
  SrgbColor,
  ShadowStyle,
  TextLayer,
} from './document/types'

export const CLIPBOARD_LAYERS_MIME =
  'application/x-cute-screen-layers+json;version=1' as const

export interface ClipboardLayersV1 {
  readonly version: 1
  readonly layers: readonly LayerNode[]
}

const IDENTITY = Object.freeze({
  translateX: 0,
  translateY: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
})

const BLACK_FILL = Object.freeze({
  kind: 'solid' as const,
  color: Object.freeze({ red: 0, green: 0, blue: 0, alpha: 1 }),
  opacity: 1,
})

const DEFAULT_COLOR = Object.freeze({
  colorSpace: 'srgb' as const,
  hasIccProfile: false,
})

const SHA256_PATTERN = /^[a-f0-9]{64}$/u
const TEXT_BLEND_MODES: readonly BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'softLight',
  'hardLight',
]

function cloneLayer(layer: LayerNode): LayerNode {
  return JSON.parse(JSON.stringify(layer)) as LayerNode
}

function stripTransientLayerFields(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const input = value as Record<string, unknown>
  const { transient, draft, selection, ...layer } = input
  void transient
  void draft
  void selection
  if (
    !layer.payload ||
    typeof layer.payload !== 'object' ||
    Array.isArray(layer.payload)
  ) {
    return layer
  }
  const {
    transient: payloadTransient,
    draft: payloadDraft,
    ...payload
  } = layer.payload as Record<string, unknown>
  void payloadTransient
  void payloadDraft
  return { ...layer, payload }
}

function contentImage(layer: LayerNode): LayerNode {
  if (layer.kind !== 'image' || layer.payload.role !== 'base') return layer
  return {
    ...layer,
    locked: false,
    payload: { ...layer.payload, role: 'content' },
  }
}

function assertFinitePoint(origin: Point): void {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) {
    throw new Error('content-layer origin must be finite')
  }
}

function assertPositiveFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be positive and finite`)
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (value.length === 0) throw new Error(`${field} must not be empty`)
}

function solidTextFill(color: SrgbColor | undefined) {
  const value = color ?? BLACK_FILL.color
  if (
    ![value.red, value.green, value.blue, value.alpha].every(
      (channel) =>
        typeof channel === 'number' &&
        Number.isFinite(channel) &&
        channel >= 0 &&
        channel <= 1,
    )
  ) {
    throw new Error('text color must use finite sRGB channels from 0 to 1')
  }
  return Object.freeze({
    kind: 'solid' as const,
    color: Object.freeze({
      red: value.red,
      green: value.green,
      blue: value.blue,
      alpha: value.alpha,
    }),
    opacity: 1,
  })
}

function assertTextBackground(
  background: NonNullable<TextLayer['payload']['background']>,
): void {
  if (
    !Number.isFinite(background.padding) ||
    background.padding < 0 ||
    background.padding > 256
  ) {
    throw new Error('text background padding must be between 0 and 256')
  }
  if (
    !Number.isFinite(background.radius) ||
    background.radius < 0 ||
    background.radius > 16_384
  ) {
    throw new Error('text background radius must be between 0 and 16384')
  }
}

/**
 * Builds an uncommitted layer. The session controller decides whether it becomes
 * one addLayer or updateLayer command; a blank new session intentionally yields
 * no command.
 */
export function createTextLayer(input: {
  readonly id: string
  readonly text: string
  readonly origin: Point
  readonly font: FontReference
  readonly fontSize?: number
  readonly weight?: FontReference['weight']
  readonly italic?: boolean
  readonly underline?: boolean
  readonly letterSpacing?: number
  readonly alignment?: 'start' | 'center' | 'end' | 'justify'
  readonly lineHeight?: number
  readonly fixedWidth?: number
  readonly color?: SrgbColor
  readonly fill?: TextLayer['payload']['fill']
  readonly outline?: TextLayer['payload']['outline']
  readonly background?: TextLayer['payload']['background']
  readonly opacity?: number
  readonly blendMode?: BlendMode
  readonly shadows?: readonly ShadowStyle[]
}): TextLayer | null {
  if (input.text.length === 0) return null
  assertFinitePoint(input.origin)
  if (
    input.fixedWidth !== undefined &&
    (!Number.isFinite(input.fixedWidth) || input.fixedWidth <= 0)
  ) {
    throw new Error('fixed-width text requires a positive finite width')
  }
  const fontSize = input.fontSize ?? 16
  if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 256) {
    throw new Error('text font size must be between 8 and 256')
  }
  const lineHeight = input.lineHeight ?? 1.25
  if (!Number.isFinite(lineHeight) || lineHeight < 0.8 || lineHeight > 4) {
    throw new Error('text line height must be between 0.8 and 4')
  }
  const letterSpacing = input.letterSpacing ?? 0
  if (
    !Number.isFinite(letterSpacing) ||
    letterSpacing < -256 ||
    letterSpacing > 256
  ) {
    throw new Error('text letter spacing must be between -256 and 256')
  }
  if (input.background) assertTextBackground(input.background)
  const opacity = input.opacity ?? 1
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) {
    throw new Error('text opacity must be between 0 and 1')
  }
  const blendMode = input.blendMode ?? 'normal'
  if (!TEXT_BLEND_MODES.includes(blendMode)) {
    throw new Error('text blend mode is invalid')
  }
  const shadows = input.shadows ?? []
  if (
    shadows.length > 4 ||
    shadows.some(
      (shadow) =>
        !Number.isFinite(shadow.offsetX) ||
        !Number.isFinite(shadow.offsetY) ||
        !Number.isFinite(shadow.blur) ||
        shadow.blur < 0 ||
        shadow.blur > 128,
    )
  ) {
    throw new Error('text shadows are invalid')
  }
  const width =
    input.fixedWidth ?? Math.max(fontSize, input.text.length * fontSize * 0.6)
  return Object.freeze({
    id: input.id,
    kind: 'text',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x,
      translateY: input.origin.y,
    },
    localBounds: {
      x: 0,
      y: 0,
      width,
      height: Math.max(
        fontSize * 1.25,
        input.text.split('\n').length * fontSize * lineHeight,
      ),
    },
    opacity,
    visible: true,
    locked: false,
    blendMode,
    shadows: Object.freeze(
      shadows.map((shadow) =>
        Object.freeze({
          color: { ...shadow.color },
          offsetX: shadow.offsetX,
          offsetY: shadow.offsetY,
          blur: shadow.blur,
        }),
      ),
    ),
    payload: {
      content: {
        text: input.text,
        wrap: (input.fixedWidth === undefined ? 'autoSize' : 'fixedWidth') as
          'autoSize' | 'fixedWidth',
        ...(input.fixedWidth === undefined
          ? {}
          : { fixedWidth: input.fixedWidth }),
        spans: [
          {
            start: 0,
            end: input.text.length,
            fontSize,
            ...(input.weight === undefined ? {} : { weight: input.weight }),
            ...(input.italic === undefined ? {} : { italic: input.italic }),
            ...(input.underline === undefined
              ? {}
              : { underline: input.underline }),
            ...(input.letterSpacing === undefined ? {} : { letterSpacing }),
          },
        ],
        paragraphs: [
          {
            start: 0,
            end: input.text.length,
            alignment: input.alignment ?? 'start',
            lineHeight,
          },
        ],
      },
      font: input.font,
      fill: input.fill ?? solidTextFill(input.color),
      outline: input.outline ?? null,
      background: input.background ?? null,
    },
  })
}

export function createNumberedMarkerLayer(input: {
  readonly id: string
  readonly sequence: number
  readonly origin: Point
  readonly shape?: NumberedMarkerLayer['payload']['shape']
}): NumberedMarkerLayer {
  assertFinitePoint(input.origin)
  if (!Number.isInteger(input.sequence) || input.sequence <= 0) {
    throw new Error('numbered marker sequence must be a positive integer')
  }
  return Object.freeze({
    id: input.id,
    kind: 'numberedMarker',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x,
      translateY: input.origin.y,
    },
    localBounds: { x: 0, y: 0, width: 32, height: 32 },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: {
      sequence: input.sequence,
      shape: input.shape ?? 'circle',
      label: {
        text: String(input.sequence),
        wrap: 'autoSize' as const,
        spans: [],
        paragraphs: [],
      },
      fill: BLACK_FILL,
      outline: null,
    },
  })
}

/** Creates one portable callout node; the direct editor owns later text edits. */
export function createCalloutLayer(input: {
  readonly id: string
  readonly text: string
  readonly origin: Point
  readonly tailAnchor: Point
  readonly font: FontReference
  readonly padding?: number
  readonly radius?: number
}): CalloutLayer | null {
  if (input.text.length === 0) return null
  assertFinitePoint(input.origin)
  assertFinitePoint(input.tailAnchor)
  const padding = input.padding ?? 8
  const radius = input.radius ?? 8
  if (!Number.isFinite(padding) || padding < 0) {
    throw new Error('callout padding must be finite and non-negative')
  }
  if (!Number.isFinite(radius) || radius < 0) {
    throw new Error('callout radius must be finite and non-negative')
  }
  const fontSize = 16
  const lines = input.text.split('\n')
  const width = Math.max(
    fontSize * 4,
    Math.max(...lines.map((line) => line.length)) * fontSize * 0.6,
  )
  const lineHeight = fontSize * 1.25
  return Object.freeze({
    id: input.id,
    kind: 'callout',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x,
      translateY: input.origin.y,
    },
    localBounds: {
      x: 0,
      y: 0,
      width: width + padding * 2,
      height: lines.length * lineHeight + padding * 2,
    },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: {
      content: {
        text: input.text,
        wrap: 'autoSize' as const,
        spans: [],
        paragraphs: [],
      },
      font: input.font,
      fill: BLACK_FILL,
      outline: null,
      padding,
      radius,
      tailAnchor: { x: input.tailAnchor.x, y: input.tailAnchor.y },
    },
  })
}

/** Emoji stays portable by storing its grapheme and an approved static asset ID. */
export function createEmojiLayer(input: {
  readonly id: string
  readonly grapheme: string
  readonly origin: Point
  readonly asset: EmojiAssetReference
  readonly size?: number
}): EmojiLayer {
  assertFinitePoint(input.origin)
  assertNonEmptyString(input.grapheme, 'emoji grapheme')
  if ([...input.grapheme].length > 16) {
    throw new Error('emoji grapheme must contain at most 16 code points')
  }
  assertNonEmptyString(input.asset.version, 'emoji asset version')
  assertNonEmptyString(input.asset.assetId, 'emoji asset id')
  const size = input.size ?? 32
  assertPositiveFinite(size, 'emoji size')
  return Object.freeze({
    id: input.id,
    kind: 'emoji',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x,
      translateY: input.origin.y,
    },
    localBounds: { x: 0, y: 0, width: size, height: size },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: { grapheme: input.grapheme, asset: input.asset },
  })
}

/**
 * Creates an ordinary content image. The caller supplies an immutable blob
 * produced by the native staged-import path; this helper never receives bytes.
 */
export function createContentImageLayer(input: {
  readonly id: string
  readonly blobHash: string
  readonly format: ImageLayer['payload']['format']
  readonly intrinsicWidth: number
  readonly intrinsicHeight: number
  readonly origin: Point
}): ImageLayer {
  assertFinitePoint(input.origin)
  if (!SHA256_PATTERN.test(input.blobHash)) {
    throw new Error('content image blob hash must be a lowercase SHA-256 hash')
  }
  assertPositiveFinite(input.intrinsicWidth, 'content image width')
  assertPositiveFinite(input.intrinsicHeight, 'content image height')
  return Object.freeze({
    id: input.id,
    kind: 'image',
    transform: {
      ...IDENTITY,
      translateX: input.origin.x,
      translateY: input.origin.y,
    },
    localBounds: {
      x: 0,
      y: 0,
      width: input.intrinsicWidth,
      height: input.intrinsicHeight,
    },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: {
      blobHash: input.blobHash,
      intrinsicWidth: input.intrinsicWidth,
      intrinsicHeight: input.intrinsicHeight,
      format: input.format,
      orientationApplied: true as const,
      color: DEFAULT_COLOR,
      role: 'content' as const,
      border: null,
      radius: 0,
      crop: null,
      mask: null,
    },
  })
}

/** The value is document-level, independent from paint order or z-order. */
export function nextNumberedMarkerSequence(
  layers: readonly LayerNode[],
): number {
  const used = new Set(
    layers.flatMap((layer) =>
      layer.kind === 'numberedMarker' ? [layer.payload.sequence] : [],
    ),
  )
  let candidate = 1
  while (used.has(candidate)) candidate += 1
  return candidate
}

export function encodeClipboardLayersV1(layers: readonly LayerNode[]): string {
  const payload: ClipboardLayersV1 = {
    version: 1,
    layers: layers.map((layer) => contentImage(cloneLayer(layer))),
  }
  return JSON.stringify(payload)
}

export function decodeClipboardLayersV1(serialized: string): ClipboardLayersV1 {
  let candidate: unknown
  try {
    candidate = JSON.parse(serialized) as unknown
  } catch {
    throw new Error('clipboard layer payload is not valid JSON')
  }
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    (candidate as { version?: unknown }).version !== 1 ||
    !Array.isArray((candidate as { layers?: unknown }).layers)
  ) {
    throw new Error('clipboard layer payload has an unsupported version')
  }
  const layers = (candidate as { layers: unknown[] }).layers
  if (layers.length === 0 || layers.length > 500) {
    throw new Error('clipboard layer payload has an invalid layer count')
  }
  const parsedLayers = layers.map((rawLayer, index) => {
    const normalizedInput = contentImage(
      cloneLayer(stripTransientLayerFields(rawLayer) as LayerNode),
    )
    const parsed = parseEditorDocument({
      schemaVersion: 5,
      id: '019c1f62-058e-7000-8000-000000000000',
      source: {
        blobHash: 'a'.repeat(64),
        format: 'png',
        mimeType: 'image/png',
        width: 1,
        height: 1,
        orientationApplied: true,
        provenance: 'clipboard',
        color: { colorSpace: 'srgb', hasIccProfile: false },
      },
      canvas: { width: 1, height: 1 },
      crop: null,
      layers: [normalizedInput as unknown as JsonObject],
      presentation: {
        beautify: { enabled: false },
        watermark: { enabled: false },
      },
      createdAt: '2026-08-10T00:00:00.000Z',
      updatedAt: '2026-08-10T00:00:00.000Z',
    })
    if (parsed.kind !== 'editable') {
      throw new Error(`clipboard layer ${index} uses a newer document schema`)
    }
    const layer = parsed.document.layers[0]
    if (!layer)
      throw new Error(`clipboard layer ${index} is missing after validation`)
    return contentImage(layer)
  })
  return Object.freeze({ version: 1, layers: Object.freeze(parsedLayers) })
}

export type ClipboardDispatch =
  | Readonly<{
      kind: 'internal'
      payload: ClipboardLayersV1
      warning?: 'internalPayloadInvalid'
    }>
  | Readonly<{ kind: 'bitmap'; warning?: 'internalPayloadInvalid' }>
  | Readonly<{ kind: 'text'; text: string }>
  | Readonly<{ kind: 'emptyHint' }>
  | Readonly<{ kind: 'empty' }>

/**
 * Routes one atomic native clipboard snapshot without exposing its bytes.
 * Empty state intentionally accepts only a bitmap, avoiding a phantom document.
 */
export function routeClipboardSnapshot(input: {
  readonly activeDocument: boolean
  readonly internal?: string
  readonly bitmapAvailable?: boolean
  readonly text?: string
}): ClipboardDispatch {
  let warning: 'internalPayloadInvalid' | undefined
  if (input.activeDocument && input.internal !== undefined) {
    try {
      return Object.freeze({
        kind: 'internal' as const,
        payload: decodeClipboardLayersV1(input.internal),
      })
    } catch {
      warning = 'internalPayloadInvalid'
    }
  }
  if (input.bitmapAvailable) {
    return Object.freeze({
      kind: 'bitmap' as const,
      ...(warning === undefined ? {} : { warning }),
    })
  }
  if (input.activeDocument && input.text !== undefined) {
    return Object.freeze({ kind: 'text' as const, text: input.text })
  }
  return Object.freeze({
    kind: input.activeDocument ? ('empty' as const) : ('emptyHint' as const),
  })
}

export function pasteClipboardLayers(
  payload: ClipboardLayersV1,
  input: {
    readonly id: () => string
    readonly zoom: number
    readonly cascadeIndex: number
  },
): readonly LayerNode[] {
  if (!Number.isFinite(input.zoom) || input.zoom <= 0) {
    throw new Error('clipboard paste zoom must be positive and finite')
  }
  if (!Number.isInteger(input.cascadeIndex) || input.cascadeIndex < 0) {
    throw new Error('clipboard cascade index must be a non-negative integer')
  }
  const offset = (16 * input.cascadeIndex) / input.zoom
  const ids = new Set<string>()
  return Object.freeze(
    payload.layers.map((source) => {
      const id = input.id()
      if (ids.has(id))
        throw new Error('clipboard paste id generator returned a duplicate')
      ids.add(id)
      const layer = contentImage(cloneLayer(source))
      return Object.freeze({
        ...layer,
        id,
        locked: false,
        transform: {
          ...layer.transform,
          translateX: layer.transform.translateX + offset,
          translateY: layer.transform.translateY + offset,
        },
      }) as LayerNode
    }),
  )
}

/** Converts a completed DOM-free text session into the sole document mutation. */
export function createTextCommitCommand(input: {
  readonly existing?: TextLayer
  readonly next: TextLayer | null
  /** Required only when removing an existing layer. */
  readonly index?: number
}): EditorCommand | null {
  if (input.existing === undefined) {
    return input.next === null
      ? null
      : Object.freeze({ type: 'addLayer', layer: input.next })
  }
  if (input.next === null) {
    const index = input.index
    if (!Number.isInteger(index) || (index as number) < 0) {
      throw new Error(
        'removing committed text requires its non-negative layer index',
      )
    }
    return Object.freeze({
      type: 'removeLayer',
      layer: input.existing,
      index: index as number,
    })
  }
  if (input.existing.id !== input.next.id) {
    throw new Error('text update must preserve the layer id')
  }
  return Object.freeze({
    type: 'updateLayer',
    before: input.existing,
    after: input.next,
  })
}

export function createDuplicateLayerCommand(
  source: LayerNode,
  input: {
    readonly id: string
    readonly zoom: number
    readonly cascadeIndex: number
  },
): Extract<EditorCommand, { type: 'duplicateLayer' }> {
  const duplicated = pasteClipboardLayers(
    Object.freeze({ version: 1, layers: Object.freeze([source]) }),
    { ...input, id: () => input.id },
  )[0]
  if (!duplicated) throw new Error('duplicate source did not produce a layer')
  return Object.freeze({
    type: 'duplicateLayer',
    sourceId: source.id,
    layer: duplicated,
  })
}

/** A multi-layer paste remains one undo/redo entry. */
export function createPasteLayersCommand(
  layers: readonly LayerNode[],
): EditorCommand | null {
  if (layers.length === 0) return null
  if (layers.length === 1) {
    const layer = layers[0]
    if (!layer) return null
    return Object.freeze({ type: 'addLayer', layer })
  }
  return Object.freeze({
    type: 'batch',
    commands: Object.freeze(
      layers.map((layer) => ({ type: 'addLayer', layer }) as const),
    ),
  })
}
