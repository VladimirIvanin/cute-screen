import type {
  EditorDocument,
  ImageLayer,
  LayerNode,
  Rect,
  SourceImageRef,
} from './document/types'

export interface QuickCaptureMaterialization {
  readonly source: SourceImageRef
  readonly documentId?: string
  readonly updatedAt?: string
}

function assertCrop(document: EditorDocument, source: SourceImageRef): Rect {
  const crop = document.crop
  if (!crop) throw new Error('quick capture requires a crop')
  const values = [crop.x, crop.y, crop.width, crop.height]
  if (!values.every(Number.isFinite) || crop.width <= 0 || crop.height <= 0) {
    throw new Error('quick capture crop is invalid')
  }
  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.x + crop.width > document.canvas.width ||
    crop.y + crop.height > document.canvas.height
  ) {
    throw new Error('quick capture crop exceeds canvas bounds')
  }
  if (source.width !== crop.width || source.height !== crop.height) {
    throw new Error('quick capture source dimensions do not match crop')
  }
  return crop
}

function materializedBase(
  base: ImageLayer,
  source: SourceImageRef,
): ImageLayer {
  return {
    ...base,
    localBounds: { x: 0, y: 0, width: source.width, height: source.height },
    transform: {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    payload: {
      ...base.payload,
      blobHash: source.blobHash,
      intrinsicWidth: source.width,
      intrinsicHeight: source.height,
      format: source.format,
      orientationApplied: true,
      color: source.color as ImageLayer['payload']['color'],
      role: 'base',
      crop: null,
      mask: null,
    },
  }
}

function rebaseLayer(layer: LayerNode, crop: Rect): LayerNode {
  const transform = {
    ...layer.transform,
    translateX: layer.transform.translateX - crop.x,
    translateY: layer.transform.translateY - crop.y,
  }
  if (layer.kind === 'loupe') {
    return {
      ...layer,
      transform,
      payload: {
        ...layer.payload,
        sourceRegion: {
          ...layer.payload.sourceRegion,
          x: layer.payload.sourceRegion.x - crop.x,
          y: layer.payload.sourceRegion.y - crop.y,
        },
      },
    }
  }
  return { ...layer, transform } as LayerNode
}

/**
 * Converts an ephemeral full-frame Area document into the persisted document
 * whose immutable source is the selected crop. The input remains untouched.
 */
export function materializeQuickCaptureDocument(
  document: EditorDocument,
  input: QuickCaptureMaterialization,
): EditorDocument {
  const crop = assertCrop(document, input.source)
  const base = document.layers.find(
    (layer): layer is ImageLayer =>
      layer.kind === 'image' && layer.payload.role === 'base',
  )
  if (!base) throw new Error('quick capture document has no base layer')

  return {
    ...document,
    ...(input.documentId ? { id: input.documentId } : {}),
    source: input.source,
    canvas: { width: input.source.width, height: input.source.height },
    crop: null,
    layers: document.layers.map((layer) =>
      layer.id === base.id
        ? materializedBase(base, input.source)
        : rebaseLayer(layer, crop),
    ),
    updatedAt: input.updatedAt ?? document.updatedAt,
  }
}
