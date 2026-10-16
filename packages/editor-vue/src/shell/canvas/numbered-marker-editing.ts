import {
  measuredNumberedMarkerLayer,
  numberedMarkerCaptionBounds,
  setNumberedMarkerCaption,
  measureRichTextContent,
  type EditorDocumentV1,
  type LayerNode,
  type NumberedMarkerLayer,
  type RichTextContent,
  type TextBackground,
} from '@cute-screen/editor-renderer'
import { transformCanvasPoint } from './geometry-controller'
import type { createCanvasWorkspaceState } from './workspace-state'

type EditingText = NonNullable<ReturnType<typeof createCanvasWorkspaceState>['editingText']['value']>
export function editedNumberedMarker(
  existing: NumberedMarkerLayer,
  content: RichTextContent,
  background: TextBackground | null,
): NumberedMarkerLayer {
  const layout = measureRichTextContent(content, 480)
  const caption = layout.width >= 480 ? { ...content, wrap: 'fixedWidth' as const, fixedWidth: 480 } : { ...content, wrap: 'autoSize' as const }
  return measuredNumberedMarkerLayer(setNumberedMarkerCaption({
    ...existing,
    payload: { ...existing.payload,
      badge: { ...existing.payload.badge, color: background?.color ?? existing.payload.badge.color } },
  }, caption))
}
export function markerDocumentForScene(
  document: EditorDocumentV1 | undefined,
  editing: EditingText | undefined,
): EditorDocumentV1 | undefined {
  const existing = editing?.existing
  if (
    !document ||
    !editing ||
    existing?.kind !== 'numberedMarker'
  ) return document
  const preview = editedNumberedMarker(existing, editing.controller.state.content, editing.background)
  return { ...document, layers: document.layers.map((layer) => layer.id === preview.id ? preview : layer) }
}
export function editSelectedMarkerLabel(
  editor: { start(input: { origin: { x: number; y: number }; existing: NumberedMarkerLayer }): void },
  layer: LayerNode | undefined,
): void {
  if (layer?.kind !== 'numberedMarker') return
  editor.start({ origin: transformCanvasPoint(layer.transform, layer.localBounds), existing: layer })
}
export function positionNumberedMarkerEditor(
  editing: EditingText,
  editor: HTMLDivElement,
  zoom: number | undefined,
): void {
  if (editing.existing?.kind !== 'numberedMarker') return
  const layer = editedNumberedMarker(editing.existing, editing.controller.state.content, editing.background)
  const safe = numberedMarkerCaptionBounds(layer)
  const scale = (zoom ?? 100) / 100
  const previous = editing.origin
  editing.origin = transformCanvasPoint(layer.transform, {
    x: safe.x, y: safe.y,
  })
  editing.width = safe.width
  editor.style.left = `${Number.parseFloat(editor.style.left || '0') + (editing.origin.x - previous.x) * scale}px`
  editor.style.top = `${Number.parseFloat(editor.style.top || '0') + (editing.origin.y - previous.y) * scale}px`
}
