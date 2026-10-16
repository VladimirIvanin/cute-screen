import {
  applyLayerStyle,
  createNumberedMarkerLayer,
  rebaseNumberedMarkerLayer,
  numberedMarkerNumberContent,
  numberedMarkerCaptionBounds as coreCaptionBounds,
  numberedMarkerGeometryBounds as coreGeometryBounds,
  type LayerStyle,
  type NumberedMarkerLayer,
  type Point,
} from '@cute-screen/editor-core'
import { measureRichTextContent } from './rich-text/measure-content'

export function measuredNumberedMarkerLayer(layer: NumberedMarkerLayer): NumberedMarkerLayer {
  return rebaseNumberedMarkerLayer(layer, measureRichTextContent(numberedMarkerNumberContent(layer)))
}

export function createPreparedNumberedMarker(input: {
  readonly id: string
  readonly origin: Point
  readonly sequence: number
  readonly shape?: NumberedMarkerLayer['payload']['badge']['shape'] | undefined
  readonly style?: LayerStyle | undefined
}): NumberedMarkerLayer {
  const layer = createNumberedMarkerLayer({
    id: input.id,
    origin: input.origin,
    sequence: input.sequence,
    ...(input.shape ? { shape: input.shape } : {}),
  })
  return measuredNumberedMarkerLayer(applyLayerStyle(layer, input.style ?? {}) as NumberedMarkerLayer)
}

export function numberedMarkerCaptionBounds(layer: NumberedMarkerLayer) {
  return coreCaptionBounds(layer, { measureText: (content) => measureRichTextContent(content) })
}
export function numberedMarkerGeometryBounds(layer: NumberedMarkerLayer) {
  return coreGeometryBounds(layer, { measureText: (content) => measureRichTextContent(content) })
}
