import type {
  NumberedMarkerLayer,
  RichTextContent,
  Rect,
} from './document/types'
import type { CalloutGeometryContext } from './callout-geometry'

/** v7 label's first paragraph is the number; following paragraphs are its caption. */
export function numberedMarkerCaption(layer: NumberedMarkerLayer): RichTextContent {
  const label = layer.payload.label
  const number = String(layer.payload.sequence)
  const start = label.text === number ? label.text.length : label.text.startsWith(`${number}\n`) ? number.length + 1 : 0
  const ranges = <T extends { readonly start: number; readonly end: number }>(items: readonly T[]) =>
    items.filter((item) => item.end > start).map((item) => ({ ...item,
      start: Math.max(0, item.start - start), end: item.end - start,
    }))
  return { ...label, text: label.text.slice(start), spans: ranges(label.spans), paragraphs: ranges(label.paragraphs) }
}

export function numberedMarkerNumberContent(layer: NumberedMarkerLayer): RichTextContent {
  const text = String(layer.payload.sequence)
  const span = layer.payload.label.spans[0] ?? {
    fontFamily: 'Roboto', fontSize: 16, color: { red: 0, green: 0, blue: 0, alpha: 1 },
    weight: 700 as const, italic: false, strikethrough: false,
  }
  return { text, wrap: 'autoSize',
    spans: [{ ...span, start: 0, end: text.length }],
    paragraphs: [{ start: 0, end: text.length, alignment: 'center', listKind: 'none' }],
  }
}

export function setNumberedMarkerCaption(
  layer: NumberedMarkerLayer,
  caption: RichTextContent,
): NumberedMarkerLayer {
  const number = numberedMarkerNumberContent(layer)
  if (!caption.text) return { ...layer, payload: { ...layer.payload, label: number } }
  const offset = number.text.length + 1
  const label: RichTextContent = {
    ...caption, text: `${number.text}\n${caption.text}`,
    spans: [{ ...number.spans[0]!, end: offset },
      ...caption.spans.map((span) => ({ ...span, start: span.start + offset, end: span.end + offset }))],
    paragraphs: [{ ...number.paragraphs[0]!, end: offset },
      ...caption.paragraphs.map((paragraph) => ({ ...paragraph,
        start: paragraph.start + offset, end: paragraph.end + offset,
      }))],
  }
  return { ...layer, payload: { ...layer.payload, label } }
}

export function numberedMarkerCaptionBounds(
  layer: NumberedMarkerLayer,
  context: CalloutGeometryContext = {},
): Rect {
  const content = numberedMarkerCaption(layer)
  const fontSize = content.spans[0]?.fontSize ?? layer.payload.label.spans[0]?.fontSize ?? 16
  const lines = content.text.split('\n')
  const estimatedWidth = Math.max(fontSize, ...lines.map((line) => [...line].length * fontSize * 0.6))
  const width = content.wrap === 'fixedWidth' ? content.fixedWidth ?? estimatedWidth : estimatedWidth
  const metrics = context.measureText?.(content) ?? { width,
    height: lines.reduce((count, line) =>
      count + Math.max(1, Math.ceil(line.length * fontSize * 0.6 / width)), 0) * fontSize * 1.25,
  }
  const badge = layer.localBounds
  return { x: badge.x + badge.width + 8, y: badge.y + (badge.height - metrics.height) / 2,
    width: metrics.width, height: metrics.height }
}

export function numberedMarkerGeometryBounds(
  layer: NumberedMarkerLayer,
  context: CalloutGeometryContext = {},
): Rect {
  const badge = layer.localBounds
  if (!numberedMarkerCaption(layer).text) return badge
  const caption = numberedMarkerCaptionBounds(layer, context)
  const y = Math.min(badge.y, caption.y)
  return { x: badge.x, y, width: caption.x + caption.width - badge.x,
    height: Math.max(badge.y + badge.height, caption.y + caption.height) - y }
}
