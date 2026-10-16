import {
  calloutGeometryBounds as coreBounds,
  calloutTextLayout as coreLayout,
  calloutSelectionHandles as coreHandles,
  rebaseCalloutLayer as coreRebase,
  updateCalloutHandle as coreUpdate,
  createCalloutLayer as coreCreate,
  createDocumentRenderScene as coreScene,
  hitTestDocument as coreHit,
  hitTestDocumentAll as coreHits,
  DocumentSpatialIndex as CoreSpatialIndex,
  type CalloutGeometryContext,
} from '@cute-screen/editor-core'
import { measureRichTextContent } from './rich-text/measure-content'

/** One measured geometry boundary for browser preview, export and interaction. */
export function calloutGeometryContext(): CalloutGeometryContext {
  return typeof document === 'undefined' ? {} : { measureText: (content) => measureRichTextContent(content) }
}

export function calloutGeometryBounds(
  payload: Parameters<typeof coreBounds>[0],
  context = calloutGeometryContext(),
) {
  return coreBounds(payload, context)
}
export function calloutTextLayout(
  payload: Parameters<typeof coreLayout>[0],
  context = calloutGeometryContext(),
) {
  return coreLayout(payload, context)
}
export function calloutSelectionHandles(
  layer: Parameters<typeof coreHandles>[0],
  context = calloutGeometryContext(),
) {
  return coreHandles(layer, context)
}
export function rebaseCalloutLayer(
  layer: Parameters<typeof coreRebase>[0],
  payload: Parameters<typeof coreRebase>[1],
  context = calloutGeometryContext(),
) {
  return coreRebase(layer, payload, context)
}
export function updateCalloutHandle(
  layer: Parameters<typeof coreUpdate>[0],
  handle: Parameters<typeof coreUpdate>[1],
  point: Parameters<typeof coreUpdate>[2],
  context = calloutGeometryContext(),
) {
  return coreUpdate(layer, handle, point, context)
}
export function createCalloutLayer(
  input: Parameters<typeof coreCreate>[0],
  context = calloutGeometryContext(),
) {
  const layer = coreCreate(input)
  return layer ? coreRebase(layer, layer.payload, context) : null
}
export function createDocumentRenderScene(
  document: Parameters<typeof coreScene>[0],
  context = calloutGeometryContext(),
) {
  return coreScene(document, context)
}
export function hitTestDocument(
  document: Parameters<typeof coreHit>[0],
  point: Parameters<typeof coreHit>[1],
  context = calloutGeometryContext(),
) {
  return coreHit(document, point, context)
}
export function hitTestDocumentAll(
  document: Parameters<typeof coreHits>[0],
  point: Parameters<typeof coreHits>[1],
  context = calloutGeometryContext(),
) {
  return coreHits(document, point, context)
}
export class DocumentSpatialIndex extends CoreSpatialIndex {
  constructor(
    document: ConstructorParameters<typeof CoreSpatialIndex>[0],
    context = calloutGeometryContext(),
  ) {
    super(document, context)
  }
}
