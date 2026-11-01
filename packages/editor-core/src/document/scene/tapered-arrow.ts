import type { ArrowLayer } from '../types'
import type {
  RenderVectorNode,
  RenderNode,
} from '../../scene/contracts'
import { mapShapePath } from '../../shapes'
import {
  taperedArrowGeometry,
  taperedArrowMetrics,
} from '../../tapered-arrow'
import { arrowCapNodes } from './arrow-caps'
import {
  TRANSPARENT,
  stroke,
  layerOpacity,
  layerBlendMode,
} from './shared'

export function taperedArrowNodes(layer: ArrowLayer): readonly RenderNode[] {
  const arrow = layer.payload
  const style = stroke(arrow.stroke)
  const outline = mapShapePath(
    taperedArrowGeometry(arrow), 1, 1, layer.transform.translateX, layer.transform.translateY,
  )
  const bounds = layer.localBounds
  const node: RenderVectorNode = {
    rotation: layer.transform.rotation, opacity: layerOpacity(layer),
    visible: layer.visible, blendMode: layerBlendMode(layer), kind: 'vector', id: `${layer.id}:body`,
    x: layer.transform.translateX + bounds.x, y: layer.transform.translateY + bounds.y,
    width: bounds.width, height: bounds.height, outline, details: [], open: false,
    fill: style.color, stroke: TRANSPARENT, strokeWidth: 0,
  }
  const { body, angles, sizes } = taperedArrowMetrics(arrow)
  return [node,
    ...arrowCapNodes(layer, `${layer.id}:start-cap`, arrow.start, angles.start,
      arrow.startCap === 'solidArrow' ? 'none' : arrow.startCap, style, body[0], sizes.start || undefined),
    ...arrowCapNodes(layer, `${layer.id}:end-cap`, arrow.end, angles.end,
      arrow.endCap === 'solidArrow' ? 'none' : arrow.endCap, style, body.at(-1), sizes.end || undefined),
  ]
}
