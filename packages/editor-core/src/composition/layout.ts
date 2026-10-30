import type {
  EditorDocument,
  Point,
  Rect,
} from '../document/types'
import type { CompositionSettings } from './types'
import {
  browserChrome,
  phoneViewport,
} from './frame-catalog'

export interface CompositionLayout {
  readonly width: number
  readonly height: number
  readonly source: Rect
  readonly frame: Rect
  readonly screen: Rect
  /** Screenshot clip, excluding optional device chrome. */
  readonly viewport: Rect
  readonly content: Rect
  readonly header: Rect
  readonly footer: Rect
  readonly scale: number
}
function frameGeometry(
  source: Rect,
  settings: CompositionSettings,
) {
  const frame = settings.frame
  if (frame.kind !== 'phone') return { width: source.width, height: source.height,
    border: 0, top: browserChrome(frame) }
  const edge = Math.min(source.width, source.height)
  const portrait = frame.orientation === 'portrait'
  return { width: portrait ? edge : edge * 19.5 / 9, height: portrait ? edge * 19.5 / 9 : edge,
    border: edge * 0.035, top: 0 }
}
function fitContent(
  source: Rect,
  screen: Rect,
  settings: CompositionSettings,
): Rect {
  const frame = settings.frame
  const ratios = [screen.width / source.width, screen.height / source.height]
  const scale = (frame.fit === 'cover' ? Math.max(...ratios) : Math.min(...ratios)) * frame.zoom
  const width = source.width * scale
  const height = source.height * scale
  return { x: screen.x + (screen.width - width) / 2 + frame.offset.x,
    y: screen.y + (screen.height - height) / 2 + frame.offset.y, width, height }
}
export function resolveCompositionLayout(document: Pick<EditorDocument, 'canvas' | 'crop' | 'presentation'>): CompositionLayout {
  const source = document.crop ?? { x: 0, y: 0, ...document.canvas }
  const s = document.presentation.composition
  if (!s) return { width: source.width,
    height: source.height,
    source,
    frame: { x: 0,
      y: 0,
      width: source.width,
      height: source.height },

    screen: { x: 0, y: 0, width: source.width, height: source.height },
    viewport: { x: 0, y: 0, width: source.width, height: source.height },
    content: { x: 0, y: 0, width: source.width, height: source.height }, scale: 1,
    header: { x: 0, y: 0, width: source.width, height: 0 },
    footer: { x: 0, y: source.height, width: source.width, height: 0 } }
  return resolveLayout(source, s)
}
function resolveLayout(
  source: Rect,
  s: CompositionSettings,
): CompositionLayout {
  const g = frameGeometry(source, s)
  const unit = s.layout.insets.unit === 'percent' ? Math.min(source.width, source.height) / 100 : 1
  const i = s.layout.insets
  const naturalW = g.width + g.border * 2
  const naturalH = g.height + g.border * 2 + g.top
  const width = Math.ceil(s.layout.mode === 'auto' ? naturalW + (i.left + i.right) * unit : s.layout.width)
  const height = Math.ceil(s.layout.mode === 'auto' ? naturalH + (i.top + i.bottom) * unit + s.header.height + s.footer.height : s.layout.height)
  const availableW = Math.max(1, width - (i.left + i.right) * unit)
  const availableH = Math.max(1, height - (i.top + i.bottom) * unit - s.header.height - s.footer.height)
  const fixedChrome = s.layout.mode === 'fixed' && g.top > 0
  const scale = Math.min(availableW / naturalW,
    fixedChrome ? Math.max(1, availableH - g.top) / (naturalH - g.top) : availableH / naturalH) * s.layout.scale
  const chrome = fixedChrome ? g.top * s.layout.scale : g.top * scale
  const frameHeight = (g.height + g.border * 2) * scale + chrome
  const frame = { x: i.left * unit + (availableW - naturalW * scale) * s.layout.alignment.x + s.layout.offset.x,
    y: s.header.height + i.top * unit + (availableH - frameHeight) * s.layout.alignment.y + s.layout.offset.y,
    width: naturalW * scale, height: frameHeight }
  const screen = { x: frame.x + g.border * scale, y: frame.y + g.border * scale + chrome,
    width: g.width * scale, height: g.height * scale }
  const viewport = s.frame.kind === 'phone' ? phoneViewport(s.frame, screen) : screen
  const content = fitContent(source, viewport, s)
  return { width, height, source, frame, screen, viewport, content, scale: content.width / source.width,
    header: { x: 0, y: 0, width, height: Math.min(height, s.header.height) },
    footer: { x: 0, y: Math.max(0, height - s.footer.height), width, height: Math.min(height, s.footer.height) } }
}
export function contentToCard(
  point: Point,
  layout: CompositionLayout,
): Point {
  return { x: layout.content.x + (point.x - layout.source.x) * layout.scale,
    y: layout.content.y + (point.y - layout.source.y) * layout.scale }
}
export function cardToContent(
  point: Point,
  layout: CompositionLayout,
): Point {
  return { x: (point.x - layout.content.x) / layout.scale + layout.source.x,
    y: (point.y - layout.content.y) / layout.scale + layout.source.y }
}
