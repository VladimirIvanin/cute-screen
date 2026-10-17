import {
  selectionFrame,
  calloutGeometryContext,
  transformPoint,
  transformToMatrix,
  SMALL_SELECTION_SIZE_CSS,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import {
  previewPlacement,
  type PreviewRect,
} from './preview-placement'

export function selectionPreviewBounds(
  document: EditorDocumentV1,
  selectedIds: readonly string[],
  canvas: DOMRect,
  quickMode: boolean,
) {
  const crop = quickMode ? null : document.crop
  const output = crop ?? document.canvas
  const frame = selectionFrame(document, selectedIds, calloutGeometryContext())
  if (!frame) return undefined
  const b = frame.bounds
  const matrix = transformToMatrix(frame.transform)
  const points = [{ x: b.x, y: b.y }, { x: b.x + b.width, y: b.y },
    { x: b.x, y: b.y + b.height }, { x: b.x + b.width, y: b.y + b.height }]
    .map((point) => transformPoint(matrix, point)).map((point) => ({
      x: canvas.left + (point.x - (crop?.x ?? 0)) * canvas.width / output.width,
      y: canvas.top + (point.y - (crop?.y ?? 0)) * canvas.height / output.height,
    }))
  const left = Math.min(...points.map((point) => point.x))
  const right = Math.max(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const bottom = Math.max(...points.map((point) => point.y))
  const small = right - left < SMALL_SELECTION_SIZE_CSS && bottom - top < SMALL_SELECTION_SIZE_CSS &&
    document.layers.filter((layer) => selectedIds.includes(layer.id)).every((layer) => layer.visible && !layer.locked)
  return { left, top, width: right - left, height: bottom - top, small }
}

export function selectionToolbarPosition(
  object: PreviewRect,
  size: { width: number; height: number },
  view: PreviewRect,
  safeBottom: number,
  panel: DOMRect | undefined,
  avoidObject: boolean,
) {
  const { width, height } = size
  const { left, top } = object
  const right = left + object.width
  const bottom = top + object.height
  const above = top - height - 10
  const viewRight = view.left + view.width
  const safeRight = panel && panel.height > 0 ? Math.min(viewRight, panel.left - 8) : viewRight
  const fitsBesidePanel = width + 16 <= safeRight - view.left
  const rightEdge = fitsBesidePanel ? safeRight : viewRight
  const preferredTop = above >= view.top + 8 ? above : bottom + 10
  const panelBottom = !fitsBesidePanel && panel ? panel.bottom + 8 : view.top
  if (avoidObject) {
    const placement = previewPlacement(
      { left: left - 9, top: top - 9, width: object.width + 18, height: object.height + 18 },
      size, { left: view.left, top: view.top, width: rightEdge - view.left, height: safeBottom - view.top },
      panel && fitsBesidePanel ? [panel] : [],
    )
    return { left: placement.left, top: placement.top, placement: placement.side }
  }
  return {
    left: Math.max(view.left + 8, Math.min(rightEdge - width - 8, (left + right - width) / 2)),
    top: Math.max(view.top + 8, Math.min(safeBottom - height - 8, Math.max(preferredTop, panelBottom))),
    placement: above >= view.top + 8 ? 'above' : 'below',
  }
}
