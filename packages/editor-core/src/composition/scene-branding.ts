import { createRenderSceneSnapshot } from '../scene/snapshot'
import type { RenderNode } from '../scene/contracts'
import type { CompositionLayout } from './layout'
import type { CardBranding } from './types'
import {
  cardRect,
  cardText,
  visibleNode,
} from './scene-primitives'

export function brandingNodes(
  block: CardBranding,
  layout: CompositionLayout,
): RenderNode[] {
  const region = block.region === 'card' ? { x: 0, y: 0, width: layout.width, height: layout.height }
    : block.region === 'content' ? layout.screen : layout[block.region]
  if (region.width <= 0 || region.height <= 0) return []
  const p = block.padding
  const logoWidth = block.image ? block.imageSize * block.image.width / block.image.height : 0
  const gap = logoWidth && block.text ? 8 : 0
  const width = Math.max(1, Math.min(region.width - p * 2,
    logoWidth + gap + Math.max(...block.text.split('\n').map((line) => line.length), 0) * block.fontSize * 0.65))
  const textWidth = Math.max(1, width - logoWidth - gap)
  const lines = Math.max(1, Math.ceil(block.text.length * block.fontSize * 0.65 / textWidth), block.text.split('\n').length)
  const height = Math.max(block.image ? block.imageSize : 0, block.text ? block.fontSize * 1.4 * lines : 1)
  const x = region.x + p + (region.width - 2 * p - width) * block.alignment.x + block.offset.x
  const y = region.y + p + (region.height - 2 * p - height) * block.alignment.y + block.offset.y
  const nodes: RenderNode[] = []
  if (block.backplate) nodes.push({ ...cardRect(`card:brand:${block.id}:plate`,
    { x: x - 6, y: y - 6, width: width + 12, height: height + 12 }, block.backplate, 4), opacity: block.opacity })
  if (block.image) nodes.push({ ...visibleNode, id: `card:brand:${block.id}:logo`, kind: 'image',
    resourceId: block.image.blobHash, x, y: y + (height - block.imageSize) / 2,
    width: logoWidth, height: block.imageSize, scaleX: 1, scaleY: 1, opacity: block.opacity })
  if (block.text) nodes.push({ ...cardText(`card:brand:${block.id}:text`, block.text,
    { x: x + logoWidth + gap,
      y,
      width: textWidth,
      height },
    block.color,
    block.fontSize,
    block.fontFamily, block.textAlignment),
  opacity: block.opacity })
  return nodes
}

export function brandingGroup(
  block: CardBranding,
  layout: CompositionLayout,
): RenderNode {
  const nodes = brandingNodes({ ...block, opacity: 1 }, layout)
  const rectangles = nodes.flatMap((node) => 'x' in node && 'width' in node ? [node] : [])
  const x = Math.min(...rectangles.map((node) => node.x), layout.width)
  const y = Math.min(...rectangles.map((node) => node.y), layout.height)
  const width = Math.max(1, ...rectangles.map((node) => node.x + node.width - x))
  const height = Math.max(1, ...rectangles.map((node) => node.y + node.height - y))
  return { ...visibleNode, id: `card:brand:${block.id}`, kind: 'group',
    opacity: block.opacity, destination: { x, y, width, height },
    clip: { x: 0, y: 0, width: layout.width, height: layout.height }, cornerRadius: 0, blur: 0,
    scene: createRenderSceneSnapshot({ width, height,
      nodes: nodes.map((node) => 'x' in node ? { ...node, x: node.x - x, y: node.y - y } : node) }) }
}
