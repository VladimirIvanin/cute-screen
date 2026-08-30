import { parseEditorDocument } from '../../document/codec'
import {
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  type JsonObject,
  type LayerNode,
} from '../../document/types'
import { cloneLayer, contentImage, stripTransientLayerFields } from './shared'

export const CLIPBOARD_LAYERS_MIME =
  'application/x-cute-screen-layers+json;version=2' as const

export interface ClipboardLayersV2 {
  readonly version: 2
  readonly documentSchemaVersion: typeof EDITOR_DOCUMENT_SCHEMA_VERSION
  readonly layers: readonly LayerNode[]
}

export function encodeClipboardLayersV2(layers: readonly LayerNode[]): string {
  const payload: ClipboardLayersV2 = {
    version: 2,
    documentSchemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    layers: layers.map((layer) => contentImage(cloneLayer(layer))),
  }
  return JSON.stringify(payload)
}

export function decodeClipboardLayersV2(serialized: string): ClipboardLayersV2 {
  let candidate: unknown
  try {
    candidate = JSON.parse(serialized) as unknown
  } catch {
    throw new Error('clipboard layer payload is not valid JSON')
  }
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    (candidate as { version?: unknown }).version !== 2 ||
    (candidate as { documentSchemaVersion?: unknown }).documentSchemaVersion !==
      EDITOR_DOCUMENT_SCHEMA_VERSION ||
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
      schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
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
  return Object.freeze({
    version: 2,
    documentSchemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    layers: Object.freeze(parsedLayers),
  })
}
