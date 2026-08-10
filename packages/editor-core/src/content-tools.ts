import { parseEditorDocument } from './document/codec'
import type { EditorCommand } from './commands/types'
import type {
  FontReference,
  JsonObject,
  LayerNode,
  NumberedMarkerLayer,
  Point,
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
  readonly fixedWidth?: number
}): TextLayer | null {
  if (input.text.length === 0) return null
  assertFinitePoint(input.origin)
  if (
    input.fixedWidth !== undefined &&
    (!Number.isFinite(input.fixedWidth) || input.fixedWidth <= 0)
  ) {
    throw new Error('fixed-width text requires a positive finite width')
  }
  const fontSize = 16
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
        input.text.split('\n').length * fontSize * 1.25,
      ),
    },
    opacity: 1,
    visible: true,
    locked: false,
    blendMode: 'normal',
    shadows: [],
    payload: {
      content: {
        text: input.text,
        wrap: (input.fixedWidth === undefined ? 'autoSize' : 'fixedWidth') as
          'autoSize' | 'fixedWidth',
        ...(input.fixedWidth === undefined
          ? {}
          : { fixedWidth: input.fixedWidth }),
        spans: [],
        paragraphs: [],
      },
      font: input.font,
      fill: BLACK_FILL,
      outline: null,
      background: null,
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
      schemaVersion: 4,
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
