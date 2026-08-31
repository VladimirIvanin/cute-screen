import {
  calloutMarkerRadius,
  calloutPathPoints,
  calloutTextLayout,
} from '../../callout-geometry'
import type { RenderNode } from '../../scene/contracts'
import type { LayerNode, RichTextContent } from '../types'
import { TEXT_BLACK, color, pathNode, stroke } from './shared'

function richTextNode(
  id: string,
  content: RichTextContent,
  geometry: Readonly<{
    x: number
    y: number
    width: number
    height: number
  }>,
  layer: Extract<
    LayerNode,
    { readonly kind: 'text' | 'numberedMarker' | 'callout' }
  >,
  verticalAlign?: 'visualCenter',
): Extract<RenderNode, { readonly kind: 'text' }> {
  return {
    id,
    kind: 'text',
    text: content.text,
    ...geometry,
    wrap: content.wrap,
    ...(content.fixedWidth === undefined
      ? {}
      : { fixedWidth: content.fixedWidth }),
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

export function textNodes(
  layer: Extract<LayerNode, { readonly kind: 'text' }>,
): readonly RenderNode[] {
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
      cornerRadius: Math.min(
        background.radius,
        backgroundBounds.width / 2,
        backgroundBounds.height / 2,
      ),
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
                      x:
                        centerX +
                        Math.cos(angle) *
                          (bounds.width / 2) *
                          (outer ? 1 : 0.45),
                      y:
                        centerY +
                        Math.sin(angle) *
                          (bounds.height / 2) *
                          (outer ? 1 : 0.45),
                    }
                  }),
          }
  return [
    node,
    richTextNode(
      `${layer.id}:label`,
      payload.label,
      { x, y, width: bounds.width, height: bounds.height },
      layer,
      'visualCenter',
    ),
  ]
}

export function calloutNodes(
  layer: Extract<LayerNode, { readonly kind: 'callout' }>,
): readonly RenderNode[] {
  const payload = layer.payload
  if (
    payload.target === undefined ||
    payload.label === undefined ||
    payload.route?.path !== 'elbow' ||
    payload.stroke === undefined
  ) {
    return []
  }
  const common = {
    rotation: layer.transform.rotation,
    opacity: 1,
    visible: layer.visible,
    blendMode: 'normal' as const,
  }
  const strokeStyle = stroke(payload.stroke)
  const markerRadius = calloutMarkerRadius(payload.stroke.width)
  const markerFill = color(payload.stroke.color)
  const pathPoints = calloutPathPoints(payload)
  const connector = pathNode(
    layer,
    `${layer.id}:connector`,
    pathPoints,
    strokeStyle,
  )
  const targetMarker: RenderNode = {
    ...common,
    id: `${layer.id}:target-marker`,
    kind: 'ellipse',
    centerX: layer.transform.translateX + payload.target.x,
    centerY: layer.transform.translateY + payload.target.y,
    radiusX: markerRadius,
    radiusY: markerRadius,
    fill: markerFill,
  }
  const labelMarker: RenderNode = {
    ...common,
    id: `${layer.id}:label-marker`,
    kind: 'ellipse',
    centerX: layer.transform.translateX + payload.label.x,
    centerY: layer.transform.translateY + payload.label.y,
    radiusX: markerRadius,
    radiusY: markerRadius,
    fill: markerFill,
  }
  const layout = calloutTextLayout(payload)
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
  if (!layout.background) {
    return [connector, targetMarker, labelMarker, text]
  }
  const background = layout.background
  const bounds = calloutTextRectFromLayout(layout)
  const backgroundNode: RenderNode = {
    ...common,
    id: `${layer.id}:background`,
    kind: 'rect',
    x: layer.transform.translateX + bounds.x,
    y: layer.transform.translateY + bounds.y,
    width: bounds.width,
    height: bounds.height,
    cornerRadius: Math.min(
      background.radius,
      bounds.width / 2,
      bounds.height / 2,
    ),
    fill: color(background.color),
  }
  return [connector, targetMarker, labelMarker, backgroundNode, text]
}

function calloutTextRectFromLayout(
  layout: ReturnType<typeof calloutTextLayout>,
): {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
} {
  const padding = layout.background?.padding ?? 0
  return {
    x: layout.text.x - padding,
    y: layout.text.y - padding,
    width: layout.text.width + padding * 2,
    height: layout.text.height + padding * 2,
  }
}
