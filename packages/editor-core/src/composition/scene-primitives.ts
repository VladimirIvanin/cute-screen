import type {
  RenderNode,
  RenderRectNode,
  RenderTextNode,
  RgbaColor,
} from '../scene/contracts'
import type { Rect } from '../document/types'
import { cardColor } from './defaults'

export const visibleNode = { visible: true, opacity: 1, rotation: 0 } as const
export function cardRect(
  id: string,
  bounds: Rect,
  fill: RgbaColor,
  radius = 0,
): RenderRectNode {
  return { ...visibleNode, id, kind: 'rect', ...bounds, fill,
    cornerRadius: Math.max(0, Math.min(radius, bounds.width / 2, bounds.height / 2)) }
}
export function cardText(
  id: string,
  text: string,
  bounds: Rect,
  color: RgbaColor,
  size = 16,
  fontFamily = 'Roboto',
  alignment: 'start' | 'center' | 'end' = 'start',
): RenderTextNode {
  return { ...visibleNode, id, kind: 'text', ...bounds, text, wrap: 'fixedWidth', fixedWidth: bounds.width,
    runs: [{ start: 0, end: text.length, color, fontFamily, fontSize: size, fontWeight: 400,
      fontStyle: 'normal', strikethrough: false }],
    paragraphs: [{ start: 0, end: text.length, alignment, listKind: 'none' }] }
}
export function cardShadow(
  bounds: Rect,
  radius: number,
  strength: number,
): RenderNode[] {
  if (strength <= 0) return []
  return Array.from({ length: 12 }, (_, index) => {
    const expand = index * 1.8 + 1
    return { ...cardRect(`card:shadow:${index}`, { x: bounds.x - expand, y: bounds.y - expand + 5,
      width: bounds.width + expand * 2, height: bounds.height + expand * 2 },
    cardColor(0, 0, 0, 0), radius + expand),
    stroke: cardColor(0, 0, 0, 1 - (1 - strength / 32) ** (12 - index)), strokeWidth: 1.9 }
  })
}
