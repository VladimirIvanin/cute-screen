import type { Rect } from '../document/types'
import type { RenderNode } from '../scene/contracts'
import type { CompositionLayout } from './layout'
import type {
  CardColor,
  CardFrame,
} from './types'
import { browserChrome } from './frame-catalog'
import { cardColor } from './defaults'
import {
  cardRect,
  cardText,
  visibleNode,
} from './scene-primitives'

function windowGlyph(
  index: number,
  bounds: Rect,
  ink: CardColor,
  face: CardColor,
  u: number,
): RenderNode[] {
  if (index === 0) return [cardRect('card:browser:minimize', { x: bounds.x + 4 * u, y: bounds.y + 11 * u,
    width: 10 * u, height: 2 * u }, ink)]
  if (index === 1) return [{ ...cardRect('card:browser:maximize', { x: bounds.x + 4 * u, y: bounds.y + 3 * u,
    width: 10 * u, height: 9 * u }, face), stroke: ink, strokeWidth: u }]
  return [-1, 1].map((sign) => ({ ...visibleNode, id: `card:browser:cross:${sign}`, kind: 'line',
    x1: bounds.x + 5 * u, y1: bounds.y + (8 + sign * 4) * u,
    x2: bounds.x + 13 * u, y2: bounds.y + (8 - sign * 4) * u, stroke: ink, strokeWidth: 1.5 * u }))
}

export function retroBrowserNodes(
  frame: CardFrame,
  layout: CompositionLayout,
): RenderNode[] {
  const mac = frame.browserStyle === 'retro-mac'
  const dark = frame.theme === 'dark'
  const height = layout.screen.y - layout.frame.y
  const u = Math.min(height / browserChrome(frame), layout.frame.width / 320)
  const width = layout.frame.width / u
  const rect = (x: number, y: number, w: number, h: number): Rect => ({
    x: layout.frame.x + x * u, y: layout.frame.y + y * u, width: Math.max(0.1, w * u), height: h * u,
  })
  const ink = dark ? cardColor(0.94, 0.94, 0.94) : cardColor(0.07, 0.07, 0.07)
  const face = dark ? cardColor(0.22, 0.23, 0.25) : cardColor(0.76, 0.76, 0.76)
  const light = dark ? cardColor(0.43, 0.44, 0.47) : cardColor(1, 1, 1)
  const shade = dark ? cardColor(0.08, 0.08, 0.09) : cardColor(0.4, 0.4, 0.4)
  const nodes: RenderNode[] = [cardRect('card:frame', layout.frame, face)]
  function bevel(
    id: string,
    bounds: Rect,
    inset = false,
  ): void {
    nodes.push({ ...cardRect(id, bounds, face), stroke: inset ? light : shade, strokeWidth: u },
      { ...visibleNode, id: `${id}:top`, kind: 'line', x1: bounds.x, y1: bounds.y,
        x2: bounds.x + bounds.width, y2: bounds.y, stroke: inset ? shade : light, strokeWidth: u },
      { ...visibleNode, id: `${id}:left`, kind: 'line', x1: bounds.x, y1: bounds.y,
        x2: bounds.x, y2: bounds.y + bounds.height, stroke: inset ? shade : light, strokeWidth: u })
  }
  function label(
    id: string,
    value: string,
    bounds: Rect,
    color = ink,
    size = 12,
  ): void {
    if (!value) return
    const max = Math.max(1, Math.floor(bounds.width / (size * u * 0.65)))
    const text = value.length > max ? value.slice(0, Math.max(0, max - 1)) + '…' : value
    nodes.push(cardText(id, text, bounds, color, size * u, 'Roboto'))
  }
  if (mac) {
    nodes.push({ ...cardRect('card:browser:titlebar', rect(2, 2, width - 4, 23), face), stroke: shade, strokeWidth: u })
    for (let row = 5; row <= 21; row += 3) {
      nodes.push(cardRect(`card:browser:stripe:${row}`, rect(6, row, width - 12, 1), shade))
    }
    bevel('card:browser:close', rect(10, 7, 12, 12))
    const titleWidth = Math.min(width - 90, frame.title.length * 8 + 14)
    if (frame.title) {
      nodes.push(cardRect('card:browser:title-fill', rect((width - titleWidth) / 2, 4, titleWidth, 19), face))
      label('card:title', frame.title, rect((width - titleWidth) / 2 + 6, 6, titleWidth - 12, 17))
    }
    bevel('card:browser:zoom', rect(width - 25, 7, 12, 12))
  } else {
    bevel('card:browser:edge', rect(1, 1, width - 2, 90))
    nodes.push(cardRect('card:browser:titlebar', rect(4, 4, width - 8, 24),
      dark ? cardColor(0.03, 0.1, 0.31) : cardColor(0, 0, 0.5)))
    label('card:title', frame.title, rect(10, 7, width - 94, 19), cardColor(1, 1, 1), 13)
    for (let index = 0; index < 3; index++) {
      const x = width - 68 + index * 21
      bevel(`card:browser:window:${index}`, rect(x, 8, 18, 16))
      nodes.push(...windowGlyph(index, rect(x, 8, 18, 16), ink, face, u))
    }
  }
  const navY = mac ? 30 : 34
  for (let index = 0; index < 3; index++) {
    const x = 8 + index * 30
    bevel(`card:browser:nav:${index}`, rect(x, navY, 24, 20))
    const points = index === 0 ? [[15, 5], [9, 10], [15, 15]]
      : index === 1 ? [[9, 5], [15, 10], [9, 15]] : [[15, 5], [8, 5], [8, 14], [16, 14], [16, 10]]
    nodes.push({ ...visibleNode, id: `card:browser:nav-symbol:${index}`, kind: 'path',
      points: points.map(([px, py]) => ({ x: layout.frame.x + (x + px!) * u, y: layout.frame.y + (navY + py!) * u })),
      stroke: ink, strokeWidth: 1.5 * u, lineJoin: 'miter' })
  }
  const addressY = mac ? 55 : 64
  bevel('card:browser:address-edge', rect(8, addressY, width - 16, 17), true)
  nodes.push(cardRect('card:browser:address', rect(10, addressY + 2, width - 20, 13),
    dark ? cardColor(0.1, 0.11, 0.12) : cardColor(1, 1, 1)))
  label('card:url', frame.url, rect(14, addressY + 1, width - 28, 16), ink, 11)
  return nodes
}
