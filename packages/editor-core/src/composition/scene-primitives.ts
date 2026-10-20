import type {
  RenderNode,
  RenderRectNode,
  RenderTextNode,
  RgbaColor,
} from '../scene/contracts'
import type { Rect } from '../document/types'
import {
  cardColor,
  createCardShadowOptions,
} from './defaults'
import type { CardShadowOptions } from './types'

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
  options: CardShadowOptions = createCardShadowOptions(),
): RenderNode[] {
  if (strength <= 0) return []
  const unit = Math.max(0.1, Math.min(8, Math.min(bounds.width, bounds.height) / 800))
  const size = unit * options.size
  const layer = (blur: number, offset: number, spread: number, alpha: number, direction: number) => ({
    offsetX: options.offset.x * direction,
    offsetY: offset * size + options.offset.y * direction,
    blur: blur * size * options.softness,
    spread: spread * size + options.spread,
    color: { ...options.color, alpha: options.color.alpha * alpha * strength },
  })
  return [{ ...cardRect('card:shadow:0', bounds, cardColor(0, 0, 0, 0), radius),
    outerShadows: [
      layer(2, 0.8, 0, 0.32, 0.06),
      layer(12, 4, -1, 0.28, 0.3),
      layer(40, 14, -3, 0.24, 1),
    ] }]
}
