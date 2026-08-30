import { freezeJsonObject, readJsonObject } from '../json'
import {
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  type EditorDocument,
  type JsonObject,
  type ParsedEditorDocument,
} from '../types'
import { assertValidLoupeSourceRegion } from '../../tools/precision/shared'
import { rulerVisualBoundsAreConservative } from '../../tools/precision/ruler'
import { parseLayer } from './layers'
import {
  collectDocumentExtras,
  parsePresentation,
  parseRect,
  parseSource,
  readFiniteNumber,
  readNonEmptyString,
  readPositiveNumber,
  readStableId,
  rectToJson,
  sourceToJson,
} from './primitives'

function documentToJson(document: EditorDocument): JsonObject {
  const layers: readonly JsonObject[] = document.layers.map((layer) => {
    const common: JsonObject = {
      ...(layer.extras ?? {}),
      id: layer.id,
      kind: layer.kind,
      transform: {
        translateX: layer.transform.translateX,
        translateY: layer.transform.translateY,
        rotation: layer.transform.rotation,
        scaleX: layer.transform.scaleX,
        scaleY: layer.transform.scaleY,
      },
      localBounds: rectToJson(layer.localBounds),
      visible: layer.visible,
      locked: layer.locked,
      payload: layer.payload,
    }
    if (
      layer.kind === 'text' ||
      layer.kind === 'numberedMarker' ||
      layer.kind === 'callout'
    ) {
      return common
    }
    return {
      ...common,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      shadows: layer.shadows,
    }
  })
  return {
    ...(document.extras ?? {}),
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id: document.id,
    source: sourceToJson(document.source),
    canvas: { width: document.canvas.width, height: document.canvas.height },
    crop: document.crop === null ? null : rectToJson(document.crop),
    layers,
    presentation: {
      beautify: { enabled: document.presentation.beautify.enabled },
      watermark: { enabled: document.presentation.watermark.enabled },
    },
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  }
}

function validateLayerRelationships(
  document: Pick<EditorDocument, 'source' | 'canvas' | 'layers'>,
): void {
  const ids = new Set<string>()
  let baseCount = 0
  for (const layer of document.layers) {
    if (ids.has(layer.id)) throw new Error(`duplicate layer id: ${layer.id}`)
    ids.add(layer.id)
    if (layer.kind === 'image' && layer.payload.role === 'base') {
      baseCount += 1
      if (layer.payload.blobHash !== document.source.blobHash) {
        throw new Error('base layer must reference source.blobHash')
      }
    }
    if (layer.kind === 'loupe') {
      assertValidLoupeSourceRegion(layer.payload.sourceRegion, document.canvas)
    }
    if (
      layer.kind === 'ruler' &&
      !rulerVisualBoundsAreConservative(layer, document.canvas)
    ) {
      throw new Error(
        `layer ${layer.id} must use conservative localBounds containing its ruler line, ticks and badge`,
      )
    }
  }
  if (baseCount > 1) {
    throw new Error('document must not contain more than one base layer')
  }
}

function parseCurrentDocument(object: Record<string, unknown>): EditorDocument {
  const canvas = readJsonObject(object.canvas, 'canvas')
  const canvasSize = Object.freeze({
    width: readPositiveNumber(canvas.width, 'canvas.width'),
    height: readPositiveNumber(canvas.height, 'canvas.height'),
  })
  if (!Array.isArray(object.layers)) throw new Error('layers must be an array')
  const source = parseSource(object.source)
  const layers = Object.freeze(object.layers.map(parseLayer))
  validateLayerRelationships({ source, canvas: canvasSize, layers })
  const crop =
    object.crop === null || object.crop === undefined
      ? null
      : parseRect(object.crop, 'crop')
  if (
    crop !== null &&
    (crop.x < 0 ||
      crop.y < 0 ||
      crop.x + crop.width > canvasSize.width ||
      crop.y + crop.height > canvasSize.height)
  ) {
    throw new Error('crop must remain inside canvas')
  }
  const extras = collectDocumentExtras(object)
  return Object.freeze({
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id: readStableId(object.id, 'id'),
    source,
    canvas: canvasSize,
    crop,
    layers,
    presentation: parsePresentation(object.presentation),
    createdAt: readNonEmptyString(object.createdAt, 'createdAt'),
    updatedAt: readNonEmptyString(object.updatedAt, 'updatedAt'),
    ...(extras === undefined ? {} : { extras }),
  })
}

export function parseEditorDocument(input: unknown): ParsedEditorDocument {
  const raw = typeof input === 'string' ? (JSON.parse(input) as unknown) : input
  const object = readJsonObject(raw, 'document')
  const schemaVersion = readFiniteNumber(object.schemaVersion, 'schemaVersion')
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    throw new Error('schemaVersion must be a non-negative integer')
  }
  if (schemaVersion > EDITOR_DOCUMENT_SCHEMA_VERSION) {
    return Object.freeze({
      kind: 'readOnly',
      schemaVersion,
      raw: freezeJsonObject(object, 'document'),
      reason: 'newerSchema',
    })
  }
  if (schemaVersion < EDITOR_DOCUMENT_SCHEMA_VERSION) {
    return Object.freeze({
      kind: 'unsupported',
      schemaVersion,
      raw: freezeJsonObject(object, 'document'),
      reason: 'olderSchema',
    })
  }
  return Object.freeze({
    kind: 'editable',
    document: parseCurrentDocument(object),
  })
}

export function normalizeEditorDocument(
  document: EditorDocument,
): EditorDocument {
  const parsed = parseEditorDocument(documentToJson(document))
  if (parsed.kind !== 'editable') {
    throw new Error('current schema unexpectedly read-only')
  }
  return parsed.document
}

export function serializeEditorDocument(document: EditorDocument): string {
  return JSON.stringify(documentToJson(normalizeEditorDocument(document)))
}
