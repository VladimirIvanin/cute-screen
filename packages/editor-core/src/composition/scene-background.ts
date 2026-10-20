import type {
  RenderNode,
  RenderSceneSnapshot,
} from '../scene/contracts'
import { createRenderSceneSnapshot } from '../scene/snapshot'
import type { Rect } from '../document/types'
import type { CardBackground } from './types'
import {
  cardRect,
  visibleNode,
} from './scene-primitives'

export function backgroundNodes(
  id: string,
  bounds: Rect,
  bg: CardBackground,
  content: RenderSceneSnapshot,
): RenderNode[] {
  if (
    bg.kind === 'transparent' ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) return []
  const base = cardRect(id, bounds, bg.color)
  if (bg.kind === 'solid') return [base]
  if (bg.kind === 'linear') return [{ ...base, fill: { kind: 'linearGradient', stops: bg.linear.stops,
    startX: bounds.x + bg.linear.start.x * bounds.width, startY: bounds.y + bg.linear.start.y * bounds.height,
    endX: bounds.x + bg.linear.end.x * bounds.width, endY: bounds.y + bg.linear.end.y * bounds.height } }]
  if (bg.kind === 'radial') return [{ ...base, fill: { kind: 'radialGradient', stops: bg.radial.stops,
    centerX: bounds.x + bg.radial.center.x * bounds.width, centerY: bounds.y + bg.radial.center.y * bounds.height,
    radius: bg.radial.radius * Math.max(bounds.width, bounds.height) } }]
  if (bg.kind === 'freeform') return [{ ...visibleNode, id, kind: 'freeform', bounds, points: bg.freeform.points }]
  if (bg.kind === 'blurred') return [imageGroup(id, bounds, bg, content, bg.blur)]
  if (!bg.image) return [base]
  const image = bg.image
  const scene = createRenderSceneSnapshot({ width: image.width, height: image.height, nodes: [{ ...visibleNode,
    id: `${id}:image`, kind: 'image', resourceId: image.blobHash, x: 0, y: 0,
    width: image.width, height: image.height, scaleX: 1, scaleY: 1 }] })
  return [base, imageGroup(id, bounds, bg, scene, 0)]
}
function imageGroup(
  id: string,
  bounds: Rect,
  bg: CardBackground,
  scene: RenderSceneSnapshot,
  blur: number,
): RenderNode {
  const source = scene.outputBounds
  const ratios = [bounds.width / source.width, bounds.height / source.height]
  const scale = (bg.fit === 'cover' ? Math.max(...ratios) : Math.min(...ratios)) * bg.scale
  const width = source.width * scale
  const height = source.height * scale
  return { ...visibleNode, id: `${id}:group`, kind: 'group', scene, clip: bounds, cornerRadius: 0, blur,
    destination: { x: bounds.x + (bounds.width - width) / 2 + bg.offset.x,
      y: bounds.y + (bounds.height - height) / 2 + bg.offset.y, width, height } }
}
