import {
  createRenderSceneSnapshot,
  type RenderNode,
  type RenderPaint,
  type RgbaColor,
} from '../render-scene'
import {
  calloutMarkerRadius,
  calloutPathPoints,
  calloutTextLayout,
} from '../callout-geometry'
import {
  arrowCapSize,
  arrowEndpointAngles,
  arrowPathPoints,
  scaledClosedArrowCapSizes,
  trimArrowBodyPoints,
} from '../arrow-geometry'
import { measureRuler } from '../precision-tools'
import type {
  ArrowCap,
  ArrowLayerPayload,
  EditorDocumentV1,
  JsonObject,
  LayerNode,
  LoupeLayer,
  RichTextContent,
  RulerLayer,
  SpotlightLayer,
  CensorLayer,
} from './types'

const TRANSPARENT: RgbaColor = Object.freeze({
  red: 0,
  green: 0,
  blue: 0,
  alpha: 0,
})
const FALLBACK_STROKE: RgbaColor = Object.freeze({
  red: 0.898,
  green: 0.282,
  blue: 0.302,
  alpha: 1,
})
const TEXT_BLACK: RgbaColor = Object.freeze({
  red: 0,
  green: 0,
  blue: 0,
  alpha: 1,
})

function color(value: unknown, fallback = FALLBACK_STROKE): RgbaColor {
  if (!value || typeof value !== 'object') return fallback
  const input = value as Record<string, unknown>
  const channels = [input.red, input.green, input.blue, input.alpha]
  if (
    !channels.every(
      (channel) =>
        typeof channel === 'number' &&
        Number.isFinite(channel) &&
        channel >= 0 &&
        channel <= 1,
    )
  )
    return fallback
  return Object.freeze({
    red: input.red as number,
    green: input.green as number,
    blue: input.blue as number,
    alpha: input.alpha as number,
  })
}

function paintOpacity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1
}

function fill(
  value: unknown,
  geometry: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  },
): RenderPaint {
  if (!value || typeof value !== 'object') return TRANSPARENT
  const input = value as Record<string, unknown>
  if (input.kind === 'none') return TRANSPARENT
  if (input.kind === 'solid') {
    const base = color(input.color, TRANSPARENT)
    const opacity = paintOpacity(input.opacity)
    return Object.freeze({
      ...base,
      alpha: base.alpha * Math.max(0, Math.min(1, opacity)),
    })
  }
  const stops = Array.isArray(input.stops)
    ? input.stops.map((stop) => {
        const entry = stop as Record<string, unknown>
        return Object.freeze({
          position: typeof entry.position === 'number' ? entry.position : 0,
          color: Object.freeze({
            ...color(entry.color, TRANSPARENT),
            alpha:
              color(entry.color, TRANSPARENT).alpha *
              paintOpacity(input.opacity),
          }),
        })
      })
    : []
  if (input.kind === 'linearGradient' && stops.length >= 2) {
    const start = localPoint(input.start, { x: 0, y: 0 })
    const end = localPoint(input.end, { x: 1, y: 1 })
    return Object.freeze({
      kind: 'linearGradient' as const,
      startX: geometry.x + start.x * geometry.width,
      startY: geometry.y + start.y * geometry.height,
      endX: geometry.x + end.x * geometry.width,
      endY: geometry.y + end.y * geometry.height,
      stops: Object.freeze(stops),
    })
  }
  if (input.kind === 'radialGradient' && stops.length >= 2) {
    const center = localPoint(input.center, { x: 0.5, y: 0.5 })
    const radius = typeof input.radius === 'number' ? input.radius : 0.5
    return Object.freeze({
      kind: 'radialGradient' as const,
      centerX: geometry.x + center.x * geometry.width,
      centerY: geometry.y + center.y * geometry.height,
      radius: Math.max(
        0.001,
        radius * Math.max(geometry.width, geometry.height),
      ),
      stops: Object.freeze(stops),
    })
  }
  if (input.kind === 'imageTexture') {
    const transform =
      input.transform && typeof input.transform === 'object'
        ? (input.transform as Record<string, unknown>)
        : {}
    if (
      typeof input.blobHash === 'string' &&
      input.blobHash.length === 64 &&
      /^[a-f0-9]+$/u.test(input.blobHash)
    ) {
      return Object.freeze({
        kind: 'imageTexture' as const,
        resourceId: input.blobHash,
        opacity: paintOpacity(input.opacity),
        scale:
          typeof transform.scale === 'number' && transform.scale > 0
            ? transform.scale
            : 1,
        rotation:
          typeof transform.rotation === 'number' ? transform.rotation : 0,
        offsetX: typeof transform.offsetX === 'number' ? transform.offsetX : 0,
        offsetY: typeof transform.offsetY === 'number' ? transform.offsetY : 0,
      })
    }
  }
  // Bundled patterns and a missing/corrupt texture are recoverable visible
  // fallbacks until their resource/shader compiler is attached.
  return Object.freeze({ red: 0.898, green: 0.282, blue: 0.302, alpha: 0.16 })
}

function stroke(value: unknown): {
  readonly color: RgbaColor
  readonly width: number
  readonly cap: 'butt' | 'round' | 'square'
  readonly join: 'miter' | 'round' | 'bevel'
  readonly dash?: readonly number[]
} {
  if (!value || typeof value !== 'object')
    return { color: FALLBACK_STROKE, width: 1, cap: 'butt', join: 'miter' }
  const input = value as Record<string, unknown>
  const width =
    typeof input.width === 'number' &&
    Number.isFinite(input.width) &&
    input.width > 0
      ? input.width
      : 1
  const style = input.style
  return {
    color: color(input.color),
    width,
    cap: input.cap === 'round' || input.cap === 'square' ? input.cap : 'butt',
    join:
      input.join === 'round' || input.join === 'bevel' ? input.join : 'miter',
    ...(style === 'dashed'
      ? { dash: Object.freeze([width * 3, width * 2]) }
      : {}),
    ...(style === 'dotted' ? { dash: Object.freeze([width, width * 2]) } : {}),
  }
}

function bounds(layer: LayerNode) {
  return layer.localBounds
}

function layerOpacity(layer: LayerNode): number {
  return 'opacity' in layer ? layer.opacity : 1
}

function layerBlendMode(layer: LayerNode) {
  return 'blendMode' in layer ? layer.blendMode : 'normal'
}

function localPoint(
  value: unknown,
  fallback: { readonly x: number; readonly y: number },
) {
  if (!value || typeof value !== 'object') return fallback
  const input = value as Record<string, unknown>
  return {
    x:
      typeof input.x === 'number' && Number.isFinite(input.x)
        ? input.x
        : fallback.x,
    y:
      typeof input.y === 'number' && Number.isFinite(input.y)
        ? input.y
        : fallback.y,
  }
}

function lineNode(
  layer: LayerNode,
  id: string,
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
  style: ReturnType<typeof stroke>,
): RenderNode {
  return {
    kind: 'line',
    id,
    x1: layer.transform.translateX + start.x,
    y1: layer.transform.translateY + start.y,
    x2: layer.transform.translateX + end.x,
    y2: layer.transform.translateY + end.y,
    rotation: layer.transform.rotation,
    opacity: layerOpacity(layer),
    visible: layer.visible,
    blendMode: layerBlendMode(layer),
    stroke: style.color,
    strokeWidth: style.width,
    lineCap: style.cap,
    lineJoin: style.join,
    ...(style.dash === undefined ? {} : { dash: style.dash }),
  }
}

function pathNode(
  layer: LayerNode,
  id: string,
  points: readonly { readonly x: number; readonly y: number }[],
  style: ReturnType<typeof stroke>,
): RenderNode {
  return {
    kind: 'path',
    id,
    points: points.map((point) => ({
      x: layer.transform.translateX + point.x,
      y: layer.transform.translateY + point.y,
    })),
    rotation: layer.transform.rotation,
    opacity: layerOpacity(layer),
    visible: layer.visible,
    blendMode: layerBlendMode(layer),
    stroke: style.color,
    strokeWidth: style.width,
    lineCap: style.cap,
    lineJoin: style.join,
    ...(style.dash === undefined ? {} : { dash: style.dash }),
  }
}

function arrowCapNodes(
  layer: LayerNode,
  id: string,
  point: { readonly x: number; readonly y: number },
  angle: number,
  cap: ArrowCap,
  style: ReturnType<typeof stroke>,
  bodyJoin?: { readonly x: number; readonly y: number },
  renderedSize?: number,
): readonly RenderNode[] {
  if (cap === 'none') return []
  const anchor = {
    x: layer.transform.translateX + point.x,
    y: layer.transform.translateY + point.y,
  }
  const size = renderedSize ?? arrowCapSize(cap, style.width)
  const behind =
    bodyJoin && (cap === 'solidArrow' || cap === 'triangle')
      ? {
          x: layer.transform.translateX + bodyJoin.x,
          y: layer.transform.translateY + bodyJoin.y,
        }
      : {
          x: anchor.x - Math.cos(angle) * size,
          y: anchor.y - Math.sin(angle) * size,
        }
  const capAngle =
    bodyJoin && (cap === 'solidArrow' || cap === 'triangle')
      ? Math.atan2(anchor.y - behind.y, anchor.x - behind.x)
      : angle
  const perpendicular = {
    x: Math.cos(capAngle + Math.PI / 2),
    y: Math.sin(capAngle + Math.PI / 2),
  }
  const left = {
    x: behind.x + perpendicular.x * size * 0.55,
    y: behind.y + perpendicular.y * size * 0.55,
  }
  const right = {
    x: behind.x - perpendicular.x * size * 0.55,
    y: behind.y - perpendicular.y * size * 0.55,
  }
  const common = {
    rotation: layer.transform.rotation,
    opacity: layerOpacity(layer),
    visible: layer.visible,
    blendMode: layerBlendMode(layer),
  }
  if (cap === 'circle') {
    return [
      {
        ...common,
        kind: 'ellipse' as const,
        id,
        centerX: anchor.x,
        centerY: anchor.y,
        radiusX: style.width,
        radiusY: style.width,
        fill: style.color,
        stroke: style.color,
        strokeWidth: Math.max(1, style.width / 2),
        lineJoin: style.join,
      },
    ]
  }
  if (cap === 'solidArrow' || cap === 'triangle') {
    return [
      {
        ...common,
        kind: 'polygon' as const,
        id,
        points: [anchor, left, right],
        fill: cap === 'solidArrow' ? style.color : TRANSPARENT,
        stroke: style.color,
        strokeWidth:
          cap === 'solidArrow' ? Math.max(1, style.width / 2) : style.width,
        lineJoin: style.join,
      },
    ]
  }
  if (cap === 'lineArrow') {
    return [
      {
        ...common,
        kind: 'path' as const,
        id,
        points: [left, anchor, right],
        stroke: style.color,
        strokeWidth: style.width,
        lineCap: style.cap,
        lineJoin: style.join,
      },
    ]
  }
  if (cap === 'diamond') {
    const forward = {
      x: anchor.x + Math.cos(angle) * size * 0.65,
      y: anchor.y + Math.sin(angle) * size * 0.65,
    }
    const back = {
      x: anchor.x - Math.cos(angle) * size * 0.65,
      y: anchor.y - Math.sin(angle) * size * 0.65,
    }
    const diamondLeft = {
      x: anchor.x + perpendicular.x * size * 0.55,
      y: anchor.y + perpendicular.y * size * 0.55,
    }
    const diamondRight = {
      x: anchor.x - perpendicular.x * size * 0.55,
      y: anchor.y - perpendicular.y * size * 0.55,
    }
    return [
      {
        ...common,
        kind: 'polygon' as const,
        id,
        points: [forward, diamondLeft, back, diamondRight],
        fill: style.color,
        stroke: style.color,
        strokeWidth: Math.max(1, style.width / 2),
        lineJoin: style.join,
      },
    ]
  }
  return []
}

function drawingNodes(layer: LayerNode): readonly RenderNode[] {
  const payload = layer.payload as JsonObject
  const localBounds = bounds(layer)
  if (layer.kind === 'arrow') {
    const arrow = payload as unknown as ArrowLayerPayload
    const style = stroke(arrow.stroke)
    const points = arrowPathPoints(arrow)
    const bodyPoints = trimArrowBodyPoints(
      points,
      arrow.startCap,
      arrow.endCap,
      style.width,
    )
    const angles = arrowEndpointAngles(points)
    const capSizes = scaledClosedArrowCapSizes(
      points,
      arrow.startCap,
      arrow.endCap,
      style.width,
    )
    return [
      ...(bodyPoints.length >= 2
        ? [pathNode(layer, `${layer.id}:body`, bodyPoints, style)]
        : []),
      ...arrowCapNodes(
        layer,
        `${layer.id}:start-cap`,
        arrow.start,
        angles.start,
        arrow.startCap,
        style,
        bodyPoints[0],
        arrow.startCap === 'solidArrow' || arrow.startCap === 'triangle'
          ? capSizes.start
          : undefined,
      ),
      ...arrowCapNodes(
        layer,
        `${layer.id}:end-cap`,
        arrow.end,
        angles.end,
        arrow.endCap,
        style,
        bodyPoints.at(-1),
        arrow.endCap === 'solidArrow' || arrow.endCap === 'triangle'
          ? capSizes.end
          : undefined,
      ),
    ]
  }
  if (layer.kind === 'shape') {
    const shape = payload.shape
    const strokeStyle = stroke(payload.stroke)
    // localBounds includes the stroke. Shapes themselves use the inner geometry
    // so draft, committed scene and export keep the same drag extents.
    const inset = strokeStyle.width / 2
    const geometry = {
      x: localBounds.x + inset,
      y: localBounds.y + inset,
      width: Math.max(1, localBounds.width - inset * 2),
      height: Math.max(1, localBounds.height - inset * 2),
    }
    const fillColor = fill(payload.fill, {
      ...geometry,
      x: geometry.x + layer.transform.translateX,
      y: geometry.y + layer.transform.translateY,
    })
    if (shape === 'circle' || shape === 'oval') {
      return [
        {
          kind: 'ellipse',
          id: layer.id,
          centerX: layer.transform.translateX + geometry.x + geometry.width / 2,
          centerY:
            layer.transform.translateY + geometry.y + geometry.height / 2,
          radiusX: geometry.width / 2,
          radiusY: geometry.height / 2,
          rotation: layer.transform.rotation,
          opacity: layer.opacity,
          visible: layer.visible,
          blendMode: layer.blendMode ?? 'normal',
          fill: fillColor,
          stroke: strokeStyle.color,
          strokeWidth: strokeStyle.width,
          lineJoin: strokeStyle.join,
        },
      ]
    }
    if (shape === 'rectangle') {
      const radius =
        typeof payload.cornerRadius === 'number' &&
        Number.isFinite(payload.cornerRadius)
          ? Math.max(
              0,
              Math.min(
                payload.cornerRadius,
                Math.min(geometry.width, geometry.height) / 2,
              ),
            )
          : 0
      return [
        {
          kind: 'rect',
          id: layer.id,
          x: layer.transform.translateX + geometry.x,
          y: layer.transform.translateY + geometry.y,
          width: geometry.width,
          height: geometry.height,
          ...(radius > 0 ? { cornerRadius: radius } : {}),
          rotation: layer.transform.rotation,
          opacity: layer.opacity,
          visible: layer.visible,
          blendMode: layer.blendMode ?? 'normal',
          fill: fillColor,
          stroke: strokeStyle.color,
          strokeWidth: strokeStyle.width,
          lineJoin: strokeStyle.join,
        },
      ]
    }
    const corners: readonly { readonly x: number; readonly y: number }[] =
      shape === 'diamond'
        ? [
            { x: geometry.x + geometry.width / 2, y: geometry.y },
            {
              x: geometry.x + geometry.width,
              y: geometry.y + geometry.height / 2,
            },
            {
              x: geometry.x + geometry.width / 2,
              y: geometry.y + geometry.height,
            },
            { x: geometry.x, y: geometry.y + geometry.height / 2 },
          ]
        : Array.from(
            { length: (Number(payload.starPoints) || 5) * 2 },
            (_, index) => {
              const count = Number(payload.starPoints) || 5
              const innerRatio = Math.max(
                0,
                Math.min(1, Number(payload.starInnerRatio) || 0.45),
              )
              const outer = index % 2 === 0
              const angle = -Math.PI / 2 + (Math.PI * index) / count
              return {
                x:
                  geometry.x +
                  geometry.width / 2 +
                  Math.cos(angle) *
                    (geometry.width / 2) *
                    (outer ? 1 : innerRatio),
                y:
                  geometry.y +
                  geometry.height / 2 +
                  Math.sin(angle) *
                    (geometry.height / 2) *
                    (outer ? 1 : innerRatio),
              }
            },
          )
    return [
      {
        kind: 'polygon' as const,
        id: layer.id,
        points: corners.map((point) => ({
          x: layer.transform.translateX + point.x,
          y: layer.transform.translateY + point.y,
        })),
        rotation: layer.transform.rotation,
        opacity: layer.opacity,
        visible: layer.visible,
        blendMode: layer.blendMode ?? 'normal',
        fill: fillColor,
        stroke: strokeStyle.color,
        strokeWidth: strokeStyle.width,
        lineJoin: strokeStyle.join,
      },
    ]
  }
  if (layer.kind === 'pencil' || layer.kind === 'marker') {
    const points = Array.isArray(payload.points)
      ? payload.points.map((point) => {
          const sample = point as Record<string, unknown>
          return {
            ...localPoint(sample, { x: 0, y: 0 }),
            pressure:
              typeof sample.pressure === 'number' &&
              Number.isFinite(sample.pressure)
                ? Math.max(0, Math.min(1, sample.pressure))
                : 0.5,
          }
        })
      : []
    const baseWidth = typeof payload.width === 'number' ? payload.width : 1
    const brushScale =
      layer.kind === 'pencil' && payload.brush === 'pencil'
        ? 0.65
        : layer.kind === 'pencil' && payload.brush === 'brush'
          ? 1.5
          : 1
    const style = {
      color: color(payload.color),
      width: baseWidth * brushScale,
      cap: 'round' as const,
      join: 'round' as const,
    }
    if (points.length === 1) {
      const radius = Math.max(
        0.5,
        (style.width * (layer.kind === 'pencil' ? points[0]!.pressure : 1)) / 2,
      )
      return [
        {
          kind: 'ellipse' as const,
          id: layer.id,
          centerX: layer.transform.translateX + points[0]!.x,
          centerY: layer.transform.translateY + points[0]!.y,
          radiusX: radius,
          radiusY: radius,
          rotation: layer.transform.rotation,
          opacity: layer.opacity,
          visible: layer.visible,
          blendMode: layer.blendMode ?? 'normal',
          fill: style.color,
        },
      ]
    }
    if (layer.kind === 'marker') {
      return [
        {
          kind: 'path' as const,
          id: `${layer.id}:stroke`,
          points: points.map((point) =>
            Object.freeze({
              x: layer.transform.translateX + point.x,
              y: layer.transform.translateY + point.y,
            }),
          ),
          rotation: layer.transform.rotation,
          opacity: layer.opacity,
          visible: layer.visible,
          blendMode: layer.blendMode ?? 'normal',
          stroke: style.color,
          strokeWidth: style.width,
          lineCap: style.cap,
          lineJoin: style.join,
        },
      ]
    }
    return points.slice(1).map((point, index) =>
      lineNode(layer, `${layer.id}:stroke:${index}`, points[index]!, point, {
        ...style,
        width: style.width * ((points[index]!.pressure + point.pressure) / 2),
      }),
    )
  }
  return []
}

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

function textNodes(
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

function numberedMarkerNodes(
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

function calloutNodes(
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

function precisionNodes(
  layer: CensorLayer | SpotlightLayer | RulerLayer | LoupeLayer,
  document: EditorDocumentV1,
): readonly RenderNode[] {
  const common = {
    id: layer.id,
    rotation: layer.transform.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    blendMode: layer.blendMode,
  }
  const localBounds = layer.localBounds
  if (layer.kind === 'censor') {
    const region =
      layer.payload.region.kind === 'rectangle'
        ? Object.freeze({
            kind: 'rectangle' as const,
            x: layer.transform.translateX + localBounds.x,
            y: layer.transform.translateY + localBounds.y,
            width: localBounds.width,
            height: localBounds.height,
          })
        : Object.freeze({
            kind: 'freeform' as const,
            points: Object.freeze(
              layer.payload.region.points.map((point) =>
                Object.freeze({
                  x: layer.transform.translateX + point.x,
                  y: layer.transform.translateY + point.y,
                }),
              ),
            ),
          })
    return [
      {
        ...common,
        kind: 'censor',
        region,
        effect:
          layer.payload.effect.mode === 'solid'
            ? Object.freeze({
                ...layer.payload.effect,
                color: color(layer.payload.effect.color),
              })
            : layer.payload.effect,
        sampleSource: 'compositeBelow',
      },
    ]
  }
  if (layer.kind === 'spotlight') {
    return [
      {
        ...common,
        kind: 'spotlight',
        aperture: Object.freeze({
          shape: layer.payload.shape,
          x: layer.transform.translateX + localBounds.x,
          y: layer.transform.translateY + localBounds.y,
          width: localBounds.width,
          height: localBounds.height,
        }),
        dimColor: color(layer.payload.dimColor),
        dimOpacity: layer.payload.dimOpacity,
        feather: layer.payload.feather,
      },
    ]
  }
  if (layer.kind === 'ruler') {
    const measurement = measureRuler(layer, document.canvas)
    return [
      {
        ...common,
        kind: 'ruler',
        x1: layer.transform.translateX + layer.payload.start.x,
        y1: layer.transform.translateY + layer.payload.start.y,
        x2: layer.transform.translateX + layer.payload.end.x,
        y2: layer.transform.translateY + layer.payload.end.y,
        ...measurement,
        unit: layer.payload.unit,
        color: layer.payload.color,
        thickness: layer.payload.thickness,
        fontSize: layer.payload.fontSize,
      },
    ]
  }
  return [
    {
      ...common,
      kind: 'loupe',
      sourceRegion: layer.payload.sourceRegion,
      lens: Object.freeze({
        shape: layer.payload.lens.shape,
        x: layer.transform.translateX + localBounds.x,
        y: layer.transform.translateY + localBounds.y,
        size: layer.payload.lens.size,
      }),
      zoom: layer.payload.zoom,
      border: Object.freeze({
        color: color(layer.payload.border.color),
        width: layer.payload.border.width,
      }),
      shadow:
        layer.payload.shadow === null
          ? null
          : Object.freeze({
              ...layer.payload.shadow,
              color: color(layer.payload.shadow.color),
            }),
      sampleSource: 'compositeBelow',
    },
  ]
}

/** Converts persisted nodes to renderer-neutral, ordered scene nodes. */
export function createDocumentRenderScene(document: EditorDocumentV1) {
  const nodes: RenderNode[] = []
  for (const layer of document.layers) {
    if (layer.kind !== 'image') {
      const annotationNodes =
        layer.kind === 'text'
          ? textNodes(layer)
          : layer.kind === 'numberedMarker'
            ? numberedMarkerNodes(layer)
            : layer.kind === 'callout'
              ? calloutNodes(layer)
              : layer.kind === 'censor' ||
                  layer.kind === 'spotlight' ||
                  layer.kind === 'ruler' ||
                  layer.kind === 'loupe'
                ? precisionNodes(layer, document)
                : drawingNodes(layer)
      nodes.push(
        ...annotationNodes.map((node) => ({
          ...node,
          scaleX: layer.transform.scaleX,
          scaleY: layer.transform.scaleY,
          transformOriginX: layer.transform.translateX,
          transformOriginY: layer.transform.translateY,
        })),
      )
      continue
    }
    const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
    const imageBorder = layer.payload.border
      ? stroke(layer.payload.border)
      : undefined
    const imageRadius = Math.max(
      0,
      Math.min(layer.payload.radius ?? 0, bounds.width / 2, bounds.height / 2),
    )
    nodes.push({
      id: layer.id,
      kind: 'image' as const,
      resourceId: layer.payload.blobHash,
      x: layer.transform.translateX + bounds.x,
      y: layer.transform.translateY + bounds.y,
      width: bounds.width,
      height: bounds.height,
      scaleX: layer.transform.scaleX,
      scaleY: layer.transform.scaleY,
      rotation: layer.transform.rotation,
      opacity: layer.opacity,
      visible: layer.visible,
      blendMode: layer.blendMode ?? 'normal',
      ...(imageRadius > 0 ? { cornerRadius: imageRadius } : {}),
      ...(imageBorder
        ? {
            stroke: imageBorder.color,
            strokeWidth: imageBorder.width,
            lineJoin: imageBorder.join,
          }
        : {}),
    })
  }
  return createRenderSceneSnapshot({
    width: document.canvas.width,
    height: document.canvas.height,
    outputBounds:
      document.crop ??
      Object.freeze({
        x: 0,
        y: 0,
        width: document.canvas.width,
        height: document.canvas.height,
      }),
    nodes,
  })
}
