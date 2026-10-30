import type { Rect } from '../document/types'
import type { RenderNode } from '../scene/contracts'
import type {
  CardFrame,
  CompositionSettings,
} from './types'
import type { CompositionLayout } from './layout'
import { cardColor } from './defaults'
import {
  phoneCamera,
  phoneCameraRadius,
  phoneNotchPath,
  phoneHardwareRect,
  phoneModel,
  phoneScreenRadius,
} from './frame-catalog'
import {
  cardRect,
  cardText,
  visibleNode,
} from './scene-primitives'
import type { CardColor } from './types'
import { mapShapePath } from '../shapes'
import {
  tablerWifiPath,
  tablerBattery3Path,
} from './tabler-status-paths'

function statusIcon(
  icon: 'wifi' | 'battery',
  bounds: Rect,
  ink: CardColor,
): RenderNode {
  return { ...visibleNode, ...bounds, id: `card:phone:${icon}`, kind: 'vector',
    outline: mapShapePath(icon === 'wifi' ? tablerWifiPath : tablerBattery3Path,
      bounds.width / 24, bounds.height / 24, bounds.x, bounds.y),
    details: [], open: true, fill: cardColor(0, 0, 0, 0), stroke: ink,
    strokeWidth: bounds.width / 12, lineCap: 'round', lineJoin: 'round' }
}

export function phoneBody(
  settings: CompositionSettings,
  layout: CompositionLayout,
): RenderNode[] {
  const f = settings.frame
  const b = layout.frame
  const edge = Math.min(b.width, b.height)
  const radius = phoneScreenRadius(f, layout.screen) + (layout.screen.x - b.x)
  const metal = f.theme === 'dark' ? cardColor(0.28, 0.3, 0.34) : cardColor(0.72, 0.74, 0.78)
  const inset = edge * 0.008
  const nodes: RenderNode[] = [cardRect('card:frame', b, metal, radius),
    cardRect('card:phone:bezel', { x: b.x + inset, y: b.y + inset,
      width: b.width - inset * 2, height: b.height - inset * 2 }, cardColor(0.025, 0.025, 0.03), radius - inset)]
  for (const [index, rect] of [
    { x: -0.033, y: 0.32, width: 0.014, height: 0.08 },
    { x: -0.033, y: 0.46, width: 0.014, height: 0.17 },
    { x: -0.033, y: 0.67, width: 0.014, height: 0.17 },
    { x: 1.019, y: 0.5, width: 0.014, height: 0.28 },
  ].entries()) {
    nodes.push(cardRect(`card:phone:button:${index}`, phoneHardwareRect(f, layout.screen, rect), metal, inset))
  }
  if (f.phoneContentMode !== 'fullscreen') {
    nodes.push(cardRect('card:phone:screen', layout.screen, f.screenColor, phoneScreenRadius(f, layout.screen)))
  }
  return nodes
}

function systemDetails(
  frame: CardFrame,
  screen: Rect,
): RenderNode[] {
  const edge = Math.min(screen.width, screen.height)
  const luminance = frame.screenColor.red * 0.2126 + frame.screenColor.green * 0.7152 + frame.screenColor.blue * 0.0722
  const ink = luminance > 0.45 ? cardColor(0.07, 0.07, 0.08) : cardColor(0.96, 0.96, 0.97)
  const unit = (x: number, y: number, width: number, height: number): Rect => ({
    x: screen.x + x * edge, y: screen.y + y * edge, width: width * edge, height: height * edge,
  })
  const right = (x: number, y: number, width: number, height: number): Rect => ({
    ...unit(0, y, width, height), x: screen.x + screen.width - (1 - x) * edge,
  })
  const left = frame.orientation === 'landscape' ? 0.16 : phoneModel(frame).camera === 'left' ? 0.145 : 0.055
  const nodes: RenderNode[] = []
  if (frame.phoneContentMode === 'fullscreen') {
    nodes.push(cardRect('card:phone:status-left', unit(left - 0.015, 0.025, 0.18, 0.065),
      { ...frame.screenColor, alpha: 0.94 }, edge * 0.015),
    cardRect('card:phone:status-right', right(0.665, 0.025, 0.29, 0.065),
      { ...frame.screenColor, alpha: 0.94 }, edge * 0.015))
  }
  nodes.push(cardText('card:phone:time', '9:41', unit(left, 0.037, 0.15, 0.05), ink, edge * 0.036))
  for (let i = 0; i < 4; i++) {
    nodes.push(cardRect(`card:phone:signal:${i}`, right(0.745 + i * 0.012, 0.065 - i * 0.008,
      0.008, 0.012 + i * 0.008), ink, edge * 0.002))
  }
  nodes.push(statusIcon('wifi', right(0.808, 0.018, 0.08, 0.08), ink),
    statusIcon('battery', right(0.89, 0.018, 0.08, 0.08), ink),
    { ...cardRect('card:phone:gesture', { x: screen.x + screen.width / 2 - edge * 0.17,
      y: screen.y + screen.height - edge * 0.037, width: edge * 0.34, height: edge * 0.012 }, ink, edge * 0.006),
    stroke: luminance > 0.45 ? cardColor(1, 1, 1, 0.7) : cardColor(0, 0, 0, 0.7), strokeWidth: edge * 0.003 })
  return nodes
}

export function phoneOverlay(
  frame: CardFrame,
  screen: Rect,
): RenderNode[] {
  if (frame.kind !== 'phone') return []
  const camera = phoneCamera(frame, screen)
  const edge = Math.min(screen.width, screen.height)
  const model = phoneModel(frame)
  const fill = cardColor(0.012, 0.012, 0.018)
  const cameraNode: RenderNode = model.camera === 'notch'
    ? { ...visibleNode, ...camera, id: 'card:phone:camera', kind: 'vector', outline: phoneNotchPath(frame, screen),
        details: [], open: false, fill, stroke: cardColor(0, 0, 0, 0), strokeWidth: 0 }
    : cardRect('card:phone:camera', camera, fill, phoneCameraRadius(frame, screen))
  const nodes: RenderNode[] = [cameraNode]
  const lens = phoneHardwareRect(frame, screen, {
    x: model.camera === 'island' ? 0.585 : model.camera === 'notch' ? 0.625 : model.camera === 'left' ? 0.077 : 0.489,
    y: model.camera === 'notch' ? 0.026 : 0.045, width: 0.022, height: 0.022,
  })
  nodes.push(cardRect('card:phone:lens', lens, cardColor(0.055, 0.12, 0.21), edge * 0.011))
  if (model.camera === 'notch') nodes.push(cardRect('card:phone:speaker',
    phoneHardwareRect(frame, screen, { x: 0.39, y: 0.032, width: 0.16, height: 0.012 }),
    cardColor(0.15, 0.15, 0.17), edge * 0.006))
  if (frame.phoneSystemDetails) nodes.push(...systemDetails(frame, screen))
  return nodes
}
