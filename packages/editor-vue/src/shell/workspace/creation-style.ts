import {
  annotationTool,
  applyLayerStyle,
  measuredNumberedMarkerLayer,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import { supportsAnnotationShadow } from './annotation-shadow'
import type { EmojiContext } from './emoji-state'

export function prepareCreationStyle(
  context: EmojiContext,
  layer: LayerNode,
): LayerNode {
  const { workspace } = context
  const shadow = workspace.rememberedStyles.value[annotationTool(layer)]?.annotationShadow
  if (supportsAnnotationShadow(annotationTool(layer)) && ['soft', 'strong'].includes(String(shadow))) {
    layer = { ...layer, annotationShadow: shadow as 'soft' | 'strong' }
  }
  // Modern ink freezes every setting, including pressure source, at pointerdown.
  if (layer.kind === 'numberedMarker') return measuredNumberedMarkerLayer(layer)
  if (
    layer.kind === 'pencil' &&
    (layer.payload.strokeVersion === 2 ||
      layer.payload.strokeVersion === 3)
  ) return layer
  const style = workspace.rememberedStyles.value[annotationTool(layer)]
  if (style && layer.kind === 'marker') {
    // The gesture already resolved Auto for this source. A remembered resolved
    // blend from another screenshot must never replace that frozen decision.
    const { blendMode: _blend, highlighterMode: _mode, ...appearance } = style
    void _blend
    void _mode
    return applyLayerStyle(
      layer,
      appearance,
      workspace.activeDocument.value?.crop ?? workspace.activeDocument.value?.canvas,
    )
  }
  return style && !['text', 'callout'].includes(layer.kind)
    ? applyLayerStyle(layer, style, workspace.activeDocument.value?.crop ?? workspace.activeDocument.value?.canvas)
    : layer
}
