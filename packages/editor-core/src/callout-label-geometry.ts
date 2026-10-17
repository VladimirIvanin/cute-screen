import type {
  CalloutPayload,
  JsonObject,
  Rect,
  RichTextContent,
} from './document/types'
const TEXT_LABEL_GAP = 6

/** Supplied by a rendering host; core never depends on DOM or font loading. */
export interface CalloutGeometryContext {
  readonly measureText?: (content: RichTextContent) => Readonly<{ width: number; height: number }>
}

export function calloutMarkerRadius(strokeWidth: number): number {
  return Math.max(strokeWidth * 1.5, 5)
}

function estimateTextSize(content: RichTextContent): Readonly<{
  readonly width: number
  readonly height: number
  readonly fontSize: number
}> {
  const fontSize = content.spans.find((span) => span.fontSize > 0)?.fontSize ?? 24
  const lines = content.text.length === 0 ? [''] : content.text.split('\n')
  const naturalWidth = Math.max(fontSize, Math.max(...lines.map((line) => [...line].length)) * fontSize * 0.6)
  const width = content.wrap === 'fixedWidth' ? content.fixedWidth ?? naturalWidth : naturalWidth
  const lineCount = content.wrap === 'fixedWidth'
    ? lines.reduce((count, line) => count + Math.max(1, Math.ceil([...line].length * fontSize * 0.6 / width)), 0)
    : lines.length
  return Object.freeze({
    width,
    height: lineCount * fontSize * 1.25,
    fontSize,
  })
}

export function calloutTextRect(
  payload: CalloutPayload,
  context: CalloutGeometryContext = {},
): Rect & JsonObject {
  const marker = payload.labelMarker === 'none' ? 0 : calloutEndpointSize(payload, 'label') / 2
  const textSize = context.measureText?.(payload.content) ?? estimateTextSize(payload.content)
  const padding = payload.frame?.kind === 'text' ? 0 : payload.frame?.padding ?? payload.background?.padding ?? 0
  const width = textSize.width + padding * 2
  const height = textSize.height + padding * 2
  if (payload.attachment) {
    const gap = payload.frame?.kind === 'text' ? marker + TEXT_LABEL_GAP : 0
    const side = payload.attachment
    return Object.freeze({
      x: side === 'left' ? payload.label.x + gap : side === 'right' ? payload.label.x - width - gap
        : payload.label.x - width / 2,
      y: side === 'top' ? payload.label.y + gap : side === 'bottom' ? payload.label.y - height - gap
        : payload.label.y - height / 2,
      width, height,
    })
  }
  const gap = calloutMarkerRadius(payload.stroke.width) + TEXT_LABEL_GAP
  return Object.freeze({
    x: payload.label.x < payload.target.x ? payload.label.x - gap - width : payload.label.x + gap,
    y: payload.label.y - height / 2, width, height,
  })
}

export function calloutEndpointSize(
  payload: CalloutPayload,
  endpoint: 'target' | 'label',
): number {
  if (payload[`${endpoint}Marker`] === 'none') return 0
  return payload[`${endpoint}MarkerStyle`]?.size ?? calloutMarkerRadius(payload.stroke.width) * 2
}
