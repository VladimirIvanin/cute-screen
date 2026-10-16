import {
  numberedMarkerCaption,
  setNumberedMarkerCaption,
  numberedMarkerNumberContent,
} from './numbered-marker-caption'
import type {
  NumberedMarkerLayer,
} from './document/types'

function shapeFactor(shape: NumberedMarkerLayer['payload']['badge']['shape']): number {
  if (shape === 'square') return 1
  if (shape === 'circle') return Math.SQRT2
  if (shape === 'diamond') return 2
  // The inner vertices enclose a disk; its inscribed square is safe for every glyph.
  return Math.SQRT2 / 0.45
}
function labelPadding(layer: NumberedMarkerLayer): number {
  return Math.max(4, (layer.payload.label.spans[0]?.fontSize ?? 16) / 4)
}

/** A centred, shape-safe rectangle for the badge number. */
export function numberedMarkerLabelBounds(layer: NumberedMarkerLayer) {
  const b = layer.localBounds
  const factor = shapeFactor(layer.payload.badge.shape)
  const padding = labelPadding(layer)
  const width = Math.max(1, b.width / factor - padding * 2)
  const height = Math.max(1, b.height / factor - padding * 2)
  return { x: b.x + (b.width - width) / 2, y: b.y + (b.height - height) / 2, width, height }
}

/** Metrics are supplied by the host; persisted geometry stays DOM-free and undoable. */
export function rebaseNumberedMarkerLayer(
  layer: NumberedMarkerLayer,
  metrics: { readonly width: number; readonly height: number },
): NumberedMarkerLayer {
  if (
    !Number.isFinite(metrics.width) ||
    !Number.isFinite(metrics.height) ||
    metrics.width < 0 ||
    metrics.height < 0
  ) {
    throw new RangeError('numbered marker metrics must be finite and nonnegative')
  }
  const paddedSize = Math.max(metrics.width, metrics.height) + labelPadding(layer) * 2
  const side = Math.ceil(Math.max(32, paddedSize * shapeFactor(layer.payload.badge.shape)))
  const b = layer.localBounds
  return { ...layer, localBounds: {
    x: b.x + (b.width - side) / 2,
    y: b.y + (b.height - side) / 2,
    width: side,
    height: side,
  } }
}

export function setNumberedMarkerSequence(
  layer: NumberedMarkerLayer,
  sequence: number,
): NumberedMarkerLayer {
  if (!Number.isSafeInteger(sequence) || sequence <= 0) {
    throw new RangeError('numbered marker sequence must be a positive safe integer')
  }
  const caption = numberedMarkerCaption(layer)
  const renumbered = { ...layer, payload: { ...layer.payload, sequence } }
  return setNumberedMarkerCaption({ ...renumbered, payload: {
    ...renumbered.payload, label: numberedMarkerNumberContent(renumbered),
  } }, caption)
}

export {
  numberedMarkerCaption,
  numberedMarkerNumberContent,
  setNumberedMarkerCaption,
  numberedMarkerCaptionBounds,
  numberedMarkerGeometryBounds,
} from './numbered-marker-caption'
