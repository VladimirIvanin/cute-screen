import type { RenderNode } from '../scene/contracts'
import type { CompositionLayout } from './layout'
import type { CompositionSettings } from './types'
import { createRenderSceneSnapshot } from '../scene/snapshot'
import { cardColor } from './defaults'
import {
  cardRect,
  cardText,
  visibleNode,
} from './scene-primitives'

export function hasWindowChrome(frame: CompositionSettings['frame']): boolean {
  return frame.kind === 'window' || frame.kind === 'browser'
}

export function frameRadius(
  settings: CompositionSettings,
  layout: CompositionLayout,
): number {
  const edge = Math.min(layout.frame.width, layout.frame.height)
  return settings.frame.kind === 'phone' ? edge * 0.1 : Math.min(settings.radius, edge / 2)
}

function screenNode(
  settings: CompositionSettings,
  layout: CompositionLayout,
): RenderNode {
  const { screen, frame } = layout
  if (hasWindowChrome(settings.frame)) return {
    ...visibleNode, id: 'card:screen', kind: 'group', destination: screen,
    scene: createRenderSceneSnapshot({ width: screen.width, height: screen.height,
      nodes: [cardRect('card:screen:fill', { x: 0, y: 0, width: screen.width, height: screen.height }, settings.frame.screenColor)] }),
    clip: frame, cornerRadius: frameRadius(settings, layout), blur: 0,
  }
  return cardRect('card:screen', screen, settings.frame.screenColor,
    settings.frame.kind === 'phone' ? Math.min(screen.width, screen.height) * 0.07 : 0)
}

export function frameNodes(
  settings: CompositionSettings,
  layout: CompositionLayout,
): RenderNode[] {
  const f = settings.frame
  if (f.kind === 'none') return []
  const dark = f.theme === 'dark'
  const nodes: RenderNode[] = [cardRect('card:frame', layout.frame,
    dark ? cardColor(0.08, 0.08, 0.1) : cardColor(0.94, 0.94, 0.96),
    frameRadius(settings, layout))]
  nodes.push(screenNode(settings, layout))
  if (f.kind === 'phone') return nodes
  const titlebar = layout.screen.y - layout.frame.y
  const chromeScale = titlebar / 40
  for (const [index,
    color] of [cardColor(1,
      0.35,
      0.33),
    cardColor(1,
      0.75,
      0.25),
    cardColor(0.2,
      0.8,
      0.35)].entries()) {
    nodes.push({ ...visibleNode, kind: 'ellipse', id: `card:button:${index}`,
      centerX: layout.frame.x + (18 + index * 20) * chromeScale,
      centerY: layout.frame.y + titlebar / 2, radiusX: 5 * chromeScale, radiusY: 5 * chromeScale, fill: color })
  }
  const width = Math.max(1, layout.frame.width - 180 * chromeScale)
  const color = dark ? cardColor(0.9, 0.9, 0.92) : cardColor(0.17, 0.17, 0.2)
  const fields = f.kind === 'browser' && f.url ? [f.title, f.url] : [f.title]
  fields.forEach((text, index) => {
    if (!text) return
    const size = (fields.length > 1 ? 11 : 14) * chromeScale
    const maxCharacters = Math.max(1, Math.floor(width / (size * 0.65)))
    const display = text.length > maxCharacters ? text.slice(0, Math.max(0, maxCharacters - 1)) + '…' : text
    nodes.push(cardText(index === 0 ? 'card:title' : 'card:url', display,
      { x: layout.frame.x + 90 * chromeScale,
        y: layout.frame.y + (fields.length > 1 ? 3 + index * 18 : 10) * chromeScale,
        width, height: size * 1.4 }, color, size, 'Roboto', 'center'))
  })
  return nodes
}
