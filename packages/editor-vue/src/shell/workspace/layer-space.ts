import {
  resolveCompositionLayout,
  type EditorDocumentV1,
  type LayerNode,
} from '@cute-screen/editor-renderer'
/** Supplies geometry for layer properties without changing the persisted document. */
export function layerSpaceDocument(
  document: EditorDocumentV1,
  layer: LayerNode,
): EditorDocumentV1 {
  if (layer.space !== 'card') return document
  const layout = resolveCompositionLayout(document)
  return { ...document, canvas: { width: layout.width, height: layout.height }, crop: null }
}
