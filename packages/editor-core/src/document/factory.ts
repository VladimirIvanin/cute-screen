import { parseEditorDocument } from './codec'
import {
  EDITOR_DOCUMENT_SCHEMA_VERSION,
  type EditorDocument,
  type JsonObject,
  type SourceImageRef,
} from './types'

/**
 * Creates the sole editable persisted document shape and validates it through
 * the production codec before returning it to a session.
 */
export function createEditorDocumentFromImage(input: {
  readonly id: string
  readonly baseLayerId: string
  readonly source: SourceImageRef
  readonly timestamp: string
}): EditorDocument {
  const candidate: JsonObject = {
    schemaVersion: EDITOR_DOCUMENT_SCHEMA_VERSION,
    id: input.id,
    source: input.source as unknown as JsonObject,
    canvas: { width: input.source.width, height: input.source.height },
    crop: null,
    layers: [
      {
        id: input.baseLayerId,
        kind: 'image',
        localBounds: {
          x: 0,
          y: 0,
          width: input.source.width,
          height: input.source.height,
        },
        transform: {
          translateX: 0,
          translateY: 0,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
        opacity: 1,
        visible: true,
        locked: true,
        blendMode: 'normal',
        shadows: [],
        payload: {
          blobHash: input.source.blobHash,
          intrinsicWidth: input.source.width,
          intrinsicHeight: input.source.height,
          format: input.source.format,
          orientationApplied: true,
          color: input.source.color as unknown as JsonObject,
          role: 'base',
          border: null,
          radius: 0,
          crop: null,
          mask: null,
        },
      },
    ],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  }
  const parsed = parseEditorDocument(candidate)
  if (parsed.kind !== 'editable') {
    throw new Error('v7 document factory did not produce an editable document')
  }
  return parsed.document
}
