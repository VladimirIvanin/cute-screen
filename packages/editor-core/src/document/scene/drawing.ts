import type { RenderNode } from '../../scene/contracts'
import type { MarkerLayer, PencilLayer, ShapeLayer } from '../types'
import { bounds, color, fill, lineNode, localPoint, stroke } from './shared'

export function shapeNodes(layer: ShapeLayer): readonly RenderNode[] {
  const payload = layer.payload
  const localBounds = bounds(layer)
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
        centerY: layer.transform.translateY + geometry.y + geometry.height / 2,
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

export function freehandNodes(
  layer: PencilLayer | MarkerLayer,
): readonly RenderNode[] {
  const payload = layer.payload
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
