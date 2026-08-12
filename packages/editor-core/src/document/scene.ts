import {
  createRenderSceneSnapshot,
  type RenderNode,
  type RenderPaint,
  type RgbaColor,
} from '../render-scene'
import type { EditorDocumentV1, JsonObject, LayerNode } from './types'

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
  return layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
}

function shadows(layer: LayerNode) {
  return Object.freeze(
    (layer.shadows ?? []).slice(0, 4).map((shadow) =>
      Object.freeze({
        color: color(shadow.color, TRANSPARENT),
        offsetX: Number.isFinite(shadow.offsetX) ? shadow.offsetX : 0,
        offsetY: Number.isFinite(shadow.offsetY) ? shadow.offsetY : 0,
        blur:
          Number.isFinite(shadow.blur) && shadow.blur >= 0
            ? Math.min(128, shadow.blur)
            : 0,
      }),
    ),
  )
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
    opacity: layer.opacity,
    visible: layer.visible,
    blendMode: layer.blendMode ?? 'normal',
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
  cap: unknown,
  style: ReturnType<typeof stroke>,
): readonly RenderNode[] {
  if (cap === 'none') return []
  const anchor = {
    x: layer.transform.translateX + point.x,
    y: layer.transform.translateY + point.y,
  }
  const size = Math.max(style.width * 3, 8)
  const perpendicular = {
    x: Math.cos(angle + Math.PI / 2),
    y: Math.sin(angle + Math.PI / 2),
  }
  const behind = {
    x: anchor.x - Math.cos(angle) * size,
    y: anchor.y - Math.sin(angle) * size,
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
    opacity: layer.opacity,
    visible: layer.visible,
    blendMode: layer.blendMode ?? 'normal',
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
  if (cap === 'triangle') {
    return [
      {
        ...common,
        kind: 'polygon' as const,
        id,
        points: [anchor, left, right],
        fill: style.color,
        stroke: style.color,
        strokeWidth: Math.max(1, style.width / 2),
        lineJoin: style.join,
      },
    ]
  }
  if (cap === 'chevron') {
    return [
      {
        ...common,
        kind: 'line' as const,
        id: `${id}:left`,
        x1: left.x,
        y1: left.y,
        x2: anchor.x,
        y2: anchor.y,
        stroke: style.color,
        strokeWidth: style.width,
        lineCap: style.cap,
        lineJoin: style.join,
      },
      {
        ...common,
        kind: 'line' as const,
        id: `${id}:right`,
        x1: right.x,
        y1: right.y,
        x2: anchor.x,
        y2: anchor.y,
        stroke: style.color,
        strokeWidth: style.width,
        lineCap: style.cap,
        lineJoin: style.join,
      },
    ]
  }
  return []
}

function triangleCapInset(
  cap: unknown,
  style: ReturnType<typeof stroke>,
): number {
  return cap === 'triangle' ? Math.max(style.width * 3, 8) : 0
}

function trimArrowBodyPoints(
  points: readonly { readonly x: number; readonly y: number }[],
  startCap: unknown,
  endCap: unknown,
  style: ReturnType<typeof stroke>,
): readonly { readonly x: number; readonly y: number }[] {
  const startInset = triangleCapInset(startCap, style)
  const endInset = triangleCapInset(endCap, style)
  if ((startInset === 0 && endInset === 0) || points.length < 2)
    return points

  const segmentLengths = points.slice(1).map((point, index) =>
    Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y),
  )
  const totalLength = segmentLengths.reduce((total, length) => total + length, 0)
  if (totalLength === 0) return []

  const insetScale = Math.min(
    1,
    totalLength / Math.max(startInset + endInset, 1),
  )
  const bodyStart = startInset * insetScale
  const bodyEnd = totalLength - endInset * insetScale
  if (bodyEnd - bodyStart <= Number.EPSILON) return []

  const pointAtDistance = (distance: number) => {
    let travelled = 0
    for (let index = 0; index < segmentLengths.length; index += 1) {
      const segmentLength = segmentLengths[index]!
      if (segmentLength === 0) continue
      if (distance <= travelled + segmentLength) {
        const start = points[index]!
        const end = points[index + 1]!
        const ratio = (distance - travelled) / segmentLength
        return {
          x: start.x + (end.x - start.x) * ratio,
          y: start.y + (end.y - start.y) * ratio,
        }
      }
      travelled += segmentLength
    }
    return points.at(-1)!
  }

  const body = [pointAtDistance(bodyStart)]
  let travelled = 0
  for (let index = 0; index < segmentLengths.length - 1; index += 1) {
    travelled += segmentLengths[index]!
    if (travelled > bodyStart && travelled < bodyEnd)
      body.push(points[index + 1]!)
  }
  body.push(pointAtDistance(bodyEnd))
  return body
}

function drawingNodes(layer: LayerNode): readonly RenderNode[] {
  const payload = layer.payload as JsonObject
  const localBounds = bounds(layer)
  if (layer.kind === 'arrow') {
    const style = stroke(payload.stroke)
    const start = localPoint(payload.start, { x: 0, y: 0 })
    const end = localPoint(payload.end, {
      x: localBounds.width,
      y: localBounds.height,
    })
    if (payload.path !== 'quadratic') {
      const angle = Math.atan2(end.y - start.y, end.x - start.x)
      const bodyPoints = trimArrowBodyPoints(
        [start, end],
        payload.startCap,
        payload.endCap,
        style,
      )
      return [
        ...(bodyPoints.length >= 2
          ? [
              lineNode(
                layer,
                `${layer.id}:body`,
                bodyPoints[0]!,
                bodyPoints.at(-1)!,
                style,
              ),
            ]
          : []),
        ...arrowCapNodes(
          layer,
          `${layer.id}:start-cap`,
          start,
          angle + Math.PI,
          payload.startCap,
          style,
        ),
        ...arrowCapNodes(
          layer,
          `${layer.id}:end-cap`,
          end,
          angle,
          payload.endCap,
          style,
        ),
      ]
    }
    const bend = localPoint(payload.bend, { x: localBounds.width / 2, y: 0 })
    const points = Array.from({ length: 17 }, (_, index) => {
      const t = index / 16
      const inverse = 1 - t
      return {
        x:
          inverse * inverse * start.x +
          2 * inverse * t * bend.x +
          t * t * end.x,
        y:
          inverse * inverse * start.y +
          2 * inverse * t * bend.y +
          t * t * end.y,
      }
    })
    const bodyPoints = trimArrowBodyPoints(
      points,
      payload.startCap,
      payload.endCap,
      style,
    )
    const body = bodyPoints
      .slice(1)
      .map((point, index) =>
        lineNode(
          layer,
          `${layer.id}:curve:${index}`,
          bodyPoints[index]!,
          point,
          style,
        ),
      )
    const startAngle = Math.atan2(bend.y - start.y, bend.x - start.x)
    const endAngle = Math.atan2(end.y - bend.y, end.x - bend.x)
    return [
      ...body,
      ...arrowCapNodes(
        layer,
        `${layer.id}:start-cap`,
        start,
        startAngle + Math.PI,
        payload.startCap,
        style,
      ),
      ...arrowCapNodes(
        layer,
        `${layer.id}:end-cap`,
        end,
        endAngle,
        payload.endCap,
        style,
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

function textNodes(
  layer: Extract<LayerNode, { readonly kind: 'text' }>,
): readonly RenderNode[] {
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const { content, font } = layer.payload
  const firstSpan = content.spans[0]
  const firstParagraph = content.paragraphs[0]
  const fontSize = firstSpan?.fontSize ?? 16
  const outline = layer.payload.outline?.stroke
  const text: RenderNode = {
    id: layer.id,
    kind: 'text',
    text: content.text,
    x: layer.transform.translateX + bounds.x,
    y: layer.transform.translateY + bounds.y,
    width: bounds.width,
    height: bounds.height,
    fontFamily: font.family,
    fontSize,
    fontWeight: firstSpan?.weight ?? font.weight,
    fontStyle: firstSpan?.italic ? 'italic' : font.style,
    ...(firstSpan?.underline ? { underline: true } : {}),
    ...(firstSpan?.letterSpacing === undefined
      ? {}
      : { letterSpacing: firstSpan.letterSpacing }),
    align: firstParagraph?.alignment ?? 'start',
    lineHeight: (firstParagraph?.lineHeight ?? 1.25) * fontSize,
    rotation: layer.transform.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    blendMode: layer.blendMode ?? 'normal',
    ...(layer.shadows?.length ? { shadows: shadows(layer) } : {}),
    fill: fill(layer.payload.fill, {
      x: layer.transform.translateX + bounds.x,
      y: layer.transform.translateY + bounds.y,
      width: bounds.width,
      height: bounds.height,
    }),
    ...(outline === undefined
      ? {}
      : {
          stroke: color(outline.color),
          strokeWidth: outline.width,
          lineJoin: outline.join,
        }),
  }
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
      opacity: layer.opacity,
      visible: layer.visible,
      blendMode: layer.blendMode ?? 'normal',
      fill: fill(background.fill, backgroundBounds),
    },
    text,
  ]
}

function numberedMarkerNodes(
  layer: Extract<LayerNode, { readonly kind: 'numberedMarker' }>,
): readonly RenderNode[] {
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 32, height: 32 }
  const x = layer.transform.translateX + bounds.x
  const y = layer.transform.translateY + bounds.y
  const centerX = x + bounds.width / 2
  const centerY = y + bounds.height / 2
  const payload = layer.payload
  const outline = payload.outline?.stroke
  const body = {
    id: `${layer.id}:body`,
    rotation: layer.transform.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    blendMode: layer.blendMode ?? 'normal',
    fill: fill(payload.fill, {
      x,
      y,
      width: bounds.width,
      height: bounds.height,
    }),
    ...(outline === undefined
      ? {}
      : {
          stroke: color(outline.color),
          strokeWidth: outline.width,
          lineJoin: outline.join,
        }),
  }
  const node: RenderNode =
    payload.shape === 'circle'
      ? {
          ...body,
          kind: 'ellipse',
          centerX,
          centerY,
          radiusX: bounds.width / 2,
          radiusY: bounds.height / 2,
        }
      : payload.shape === 'square'
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
              payload.shape === 'diamond'
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
  const fontSize = Math.max(
    12,
    Math.min(18, Math.min(bounds.width, bounds.height) * 0.55),
  )
  return [
    node,
    {
      id: `${layer.id}:label`,
      kind: 'text',
      text: payload.label.text,
      x,
      y: y + (bounds.height - fontSize * 1.25) / 2,
      width: bounds.width,
      height: fontSize * 1.25,
      fontFamily: 'Inter',
      fontSize,
      fontWeight: 700,
      fontStyle: 'normal',
      align: 'center',
      lineHeight: fontSize * 1.25,
      rotation: layer.transform.rotation,
      opacity: layer.opacity,
      visible: layer.visible,
      blendMode: layer.blendMode ?? 'normal',
      fill: { red: 1, green: 1, blue: 1, alpha: 1 },
    },
  ]
}

function calloutNodes(
  layer: Extract<LayerNode, { readonly kind: 'callout' }>,
): readonly RenderNode[] {
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const x = layer.transform.translateX + bounds.x
  const y = layer.transform.translateY + bounds.y
  const payload = layer.payload
  const outline = payload.outline?.stroke
  const common = {
    rotation: layer.transform.rotation,
    opacity: layer.opacity,
    visible: layer.visible,
    blendMode: layer.blendMode ?? 'normal',
  }
  const bubble: RenderNode = {
    ...common,
    id: `${layer.id}:bubble`,
    kind: 'rect',
    x,
    y,
    width: bounds.width,
    height: bounds.height,
    cornerRadius: Math.min(payload.radius, bounds.width / 2, bounds.height / 2),
    fill: fill(payload.fill, {
      x,
      y,
      width: bounds.width,
      height: bounds.height,
    }),
    ...(outline === undefined
      ? {}
      : {
          stroke: color(outline.color),
          strokeWidth: outline.width,
          lineJoin: outline.join,
        }),
  }
  const tailAnchor = {
    x: layer.transform.translateX + payload.tailAnchor.x,
    y: layer.transform.translateY + payload.tailAnchor.y,
  }
  const bubbleCenter = { x: x + bounds.width / 2, y: y + bounds.height / 2 }
  const vector = {
    x: tailAnchor.x - bubbleCenter.x,
    y: tailAnchor.y - bubbleCenter.y,
  }
  const vectorLength = Math.hypot(vector.x, vector.y)
  const direction =
    vectorLength > 0
      ? { x: vector.x / vectorLength, y: vector.y / vectorLength }
      : { x: 0, y: 1 }
  const boundaryScale =
    1 /
    Math.max(
      Math.abs(direction.x) / Math.max(bounds.width / 2, 0.001),
      Math.abs(direction.y) / Math.max(bounds.height / 2, 0.001),
    )
  const tailBase = {
    x: bubbleCenter.x + direction.x * boundaryScale,
    y: bubbleCenter.y + direction.y * boundaryScale,
  }
  const tailHalfWidth = 9
  const perpendicular = { x: -direction.y, y: direction.x }
  const tail: RenderNode = {
    ...common,
    id: `${layer.id}:tail`,
    kind: 'polygon',
    points: [
      {
        x: tailBase.x + perpendicular.x * tailHalfWidth,
        y: tailBase.y + perpendicular.y * tailHalfWidth,
      },
      {
        x: tailBase.x - perpendicular.x * tailHalfWidth,
        y: tailBase.y - perpendicular.y * tailHalfWidth,
      },
      tailAnchor,
    ],
    fill: fill(payload.fill, {
      x,
      y,
      width: bounds.width,
      height: bounds.height,
    }),
    ...(outline === undefined
      ? {}
      : {
          stroke: color(outline.color),
          strokeWidth: outline.width,
          lineJoin: outline.join,
        }),
  }
  const fontSize = payload.content.spans[0]?.fontSize ?? 16
  const lineHeight =
    (payload.content.paragraphs[0]?.lineHeight ?? 1.25) * fontSize
  const text: RenderNode = {
    ...common,
    id: `${layer.id}:text`,
    kind: 'text',
    text: payload.content.text,
    x: x + payload.padding,
    y: y + payload.padding,
    width: Math.max(1, bounds.width - payload.padding * 2),
    height: Math.max(1, bounds.height - payload.padding * 2),
    fontFamily: payload.font.family,
    fontSize,
    fontWeight: payload.content.spans[0]?.weight ?? payload.font.weight,
    fontStyle: payload.content.spans[0]?.italic ? 'italic' : payload.font.style,
    align: payload.content.paragraphs[0]?.alignment ?? 'start',
    lineHeight,
    fill: { red: 1, green: 1, blue: 1, alpha: 1 },
  }
  return [bubble, tail, text]
}

/** Converts persisted nodes to renderer-neutral, ordered scene nodes. */
export function createDocumentRenderScene(document: EditorDocumentV1) {
  const nodes: RenderNode[] = document.layers.flatMap((layer) => {
    if (layer.kind === 'text') return textNodes(layer)
    if (layer.kind === 'numberedMarker') return numberedMarkerNodes(layer)
    if (layer.kind === 'callout') return calloutNodes(layer)
    if (layer.kind !== 'image') return drawingNodes(layer)
    const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
    const imageBorder = layer.payload.border
      ? stroke(layer.payload.border)
      : undefined
    const imageRadius = Math.max(
      0,
      Math.min(layer.payload.radius ?? 0, bounds.width / 2, bounds.height / 2),
    )
    return [
      {
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
      },
    ]
  })
  return createRenderSceneSnapshot({
    width: document.canvas.width,
    height: document.canvas.height,
    nodes,
  })
}
