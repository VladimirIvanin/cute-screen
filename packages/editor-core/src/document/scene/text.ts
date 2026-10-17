import { calloutFrameNodes } from './callout-frame'
import { arrowCapNodes } from './arrow'
import { arrowEndpointAngles } from '../../arrow-geometry'
import {
  numberedMarkerLabelBounds,
  numberedMarkerNumberContent,
  numberedMarkerCaption,
  numberedMarkerCaptionBounds,
} from '../../numbered-marker'
import {
  type CalloutGeometryContext,
  calloutEndpointSize,
  calloutPathPoints,
  calloutTextLayout,
} from '../../callout-geometry'
import type { RenderNode } from '../../scene/contracts'
import type {
  LayerNode,
  RichTextContent,
} from '../types'
import {
  TEXT_BLACK,
  color,
  pathNode,
  stroke,
} from './shared'

function richTextNode(
  id: string,
  content: RichTextContent,
  geometry: Readonly<{
    x: number
    y: number
    width: number
    height: number
  }>,
  layer: Extract<LayerNode, { readonly kind: 'text' | 'numberedMarker' | 'callout' }>,
  verticalAlign?: 'visualCenter',
): Extract<RenderNode, { readonly kind: 'text' }> {
  return {
    id,
    kind: 'text',
    text: content.text,
    ...geometry,
    wrap: content.wrap,
    ...(content.fixedWidth === undefined ? {} : { fixedWidth: content.fixedWidth }),
    runs: content.spans.map((span) => ({
      start: span.start,
      end: span.end,
      fontFamily: span.fontFamily,
      fontSize: span.fontSize,
      color: color(span.color, TEXT_BLACK),
      fontWeight: span.weight,
      fontStyle: span.italic ? 'italic' : 'normal',
      strikethrough: span.strikethrough,
    })),
    paragraphs: content.paragraphs.map((paragraph) => ({ ...paragraph })),
    ...(verticalAlign === undefined ? {} : { verticalAlign }),
    rotation: layer.transform.rotation,
    opacity: 1,
    visible: layer.visible,
    blendMode: 'normal',
  }
}

export function textNodes(layer: Extract<LayerNode, { readonly kind: 'text' }>): readonly RenderNode[] {
  const bounds = layer.localBounds
  const { content } = layer.payload
  const text = richTextNode(
    layer.id,
    content,
    {
      x: layer.transform.translateX + bounds.x,
      y: layer.transform.translateY + bounds.y,
      width: bounds.width,
      height: bounds.height,
    },
    layer,
  )
  const background = layer.payload.background
  if (!background) return [text]
  const padding = background.padding
  const backgroundBounds = {
    x: layer.transform.translateX + bounds.x - padding,
    y: layer.transform.translateY + bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  }
  return [
    {
      id: `${layer.id}:background`,
      kind: 'rect',
      ...backgroundBounds,
      cornerRadius: Math.min(background.radius, backgroundBounds.width / 2, backgroundBounds.height / 2),
      rotation: layer.transform.rotation,
      opacity: 1,
      visible: layer.visible,
      blendMode: 'normal',
      fill: color(background.color),
    },
    text,
  ]
}

export function numberedMarkerNodes(
  layer: Extract<LayerNode, { readonly kind: 'numberedMarker' }>,
  context: CalloutGeometryContext = {},
): readonly RenderNode[] {
  const bounds = layer.localBounds
  const x = layer.transform.translateX + bounds.x
  const y = layer.transform.translateY + bounds.y
  const centerX = x + bounds.width / 2
  const centerY = y + bounds.height / 2
  const payload = layer.payload
  const body = {
    id: `${layer.id}:body`,
    rotation: layer.transform.rotation,
    opacity: 1,
    visible: layer.visible,
    blendMode: 'normal' as const,
    fill: color(payload.badge.color),
  }
  const node: RenderNode =
    payload.badge.shape === 'circle'
      ? {
          ...body,
          kind: 'ellipse',
          centerX,
          centerY,
          radiusX: bounds.width / 2,
          radiusY: bounds.height / 2,
        }
      : payload.badge.shape === 'square'
        ? {
            ...body,
            kind: 'rect',
            x,
            y,
            width: bounds.width,
            height: bounds.height,
          }
        : {
            ...body,
            kind: 'polygon',
            points:
              payload.badge.shape === 'diamond'
                ? [
                    { x: centerX, y },
                    { x: x + bounds.width, y: centerY },
                    { x: centerX, y: y + bounds.height },
                    { x, y: centerY },
                  ]
                : Array.from({ length: 10 }, (_, index) => {
                    const outer = index % 2 === 0
                    const angle = -Math.PI / 2 + (Math.PI * index) / 5
                    return {
                      x: centerX + Math.cos(angle) * (bounds.width / 2) * (outer ? 1 : 0.45),
                      y: centerY + Math.sin(angle) * (bounds.height / 2) * (outer ? 1 : 0.45),
                    }
                  }),
          }
  const labelBounds = numberedMarkerLabelBounds(layer)
  const number = numberedMarkerNumberContent(layer)
  const badgeColor = payload.badge.color
  const light = badgeColor.red * 0.299 + badgeColor.green * 0.587 + badgeColor.blue * 0.114 > 0.6
  const numberColor = { red: light ? 0 : 1, green: light ? 0 : 1, blue: light ? 0 : 1, alpha: 1 }
  const caption = numberedMarkerCaption(layer)
  const captionBounds = numberedMarkerCaptionBounds(layer, context)
  const captionNodes = caption.text ? [richTextNode(`${layer.id}:caption`, caption, {
    ...captionBounds,
    x: layer.transform.translateX + captionBounds.x,
    y: layer.transform.translateY + captionBounds.y,
  }, layer)] : []
  return [
    node,
    richTextNode(
      `${layer.id}:label`,
      { ...number, spans: number.spans.map((span) => ({ ...span, color: numberColor })) },
      { ...labelBounds,
        x: layer.transform.translateX + labelBounds.x,
        y: layer.transform.translateY + labelBounds.y,
      },
      layer,
      'visualCenter',
    ),
    ...captionNodes,
  ]
}

export function calloutNodes(
  layer: Extract<LayerNode, { readonly kind: 'callout' }>,
  context: CalloutGeometryContext = {},
): readonly RenderNode[] {
  const payload = layer.payload
  if (
    payload.target === undefined ||
    payload.label === undefined ||
    payload.route === undefined ||
    payload.stroke === undefined
  ) {
    return []
  }
  const strokeStyle = stroke(payload.stroke)
  const pathPoints = calloutPathPoints(payload, context)
  const connector = pathNode(layer, `${layer.id}:connector`, pathPoints, strokeStyle)
  const angles = arrowEndpointAngles(pathPoints)
  const markers = (['target', 'label'] as const).flatMap((endpoint) => {
    const endpointStyle = payload[`${endpoint}MarkerStyle`]
    const style = endpointStyle?.color ? { ...strokeStyle, color: color(endpointStyle.color) } : strokeStyle
    return arrowCapNodes(layer, `${layer.id}:${endpoint}-marker`, payload[endpoint],
      endpoint === 'target' ? angles.start : angles.end, payload[`${endpoint}Marker`], style, undefined,
      calloutEndpointSize(payload, endpoint))
  })
  const layout = calloutTextLayout(payload, context)
  const text = richTextNode(
    `${layer.id}:text`,
    payload.content,
    {
      x: layer.transform.translateX + layout.text.x,
      y: layer.transform.translateY + layout.text.y,
      width: layout.text.width,
      height: layout.text.height,
    },
    layer,
  )
  return [connector, ...calloutFrameNodes(layer, context), ...markers, text]
}
