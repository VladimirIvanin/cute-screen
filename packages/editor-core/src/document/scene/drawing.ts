import { resolveFreehandGeometry } from '../../tools/freehand'
import {
  shapeGeometry,
  mapShapePath,
  isShapeKind,
  flattenShapePath,
} from '../../shapes'
import type { RenderNode } from '../../scene/contracts'
import type {
  MarkerLayer,
  PencilLayer,
  ShapeLayer,
} from '../types'
import {
  bounds,
  color,
  fill,
  lineNode,
  stroke,
} from './shared'

type ShapeGeometry = Readonly<{
  x: number
  y: number
  width: number
  height: number
}>

function polygonCorners(
  shape: unknown,
  geometry: ShapeGeometry,
  payload: ShapeLayer['payload'],
): readonly { readonly x: number; readonly y: number }[] {
  const path = shapeGeometry(isShapeKind(shape) ? shape : 'rectangle', geometry.width, geometry.height, {
    starPoints: typeof payload.starPoints === 'number' ? payload.starPoints : 5,
    starInnerRatio: typeof payload.starInnerRatio === 'number' ? payload.starInnerRatio : 0.45,
  })
  return (flattenShapePath(path.outline)[0] ?? []).slice(0, -1).map((point) => ({
    x: geometry.x + point.x, y: geometry.y + point.y,
  }))
}

export function shapeNodes(layer: ShapeLayer): readonly RenderNode[] {
  const payload = layer.payload
  const localBounds = bounds(layer)
  const shape = isShapeKind(payload.shape) ? payload.shape : 'rectangle'
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
  if (!['rectangle', 'circle', 'oval', 'diamond', 'star'].includes(shape)) {
    const path = shapeGeometry(shape, geometry.width, geometry.height, {
      cornerRadius: typeof payload.cornerRadius === 'number' ? payload.cornerRadius : 0,
      starPoints: typeof payload.starPoints === 'number' ? payload.starPoints : 5,
      starInnerRatio: typeof payload.starInnerRatio === 'number' ? payload.starInnerRatio : 0.45,
    })
    const x = layer.transform.translateX + geometry.x
    const y = layer.transform.translateY + geometry.y
    return [{
      kind: 'vector', id: layer.id, x, y, width: geometry.width, height: geometry.height,
      outline: mapShapePath(path.outline, 1, 1, x, y), details: mapShapePath(path.details, 1, 1, x, y),
      open: path.open, rotation: layer.transform.rotation, opacity: layer.opacity, visible: layer.visible,
      blendMode: layer.blendMode ?? 'normal', fill: fillColor, stroke: strokeStyle.color,
      strokeWidth: strokeStyle.width, lineJoin: strokeStyle.join, lineCap: strokeStyle.cap,
      ...(strokeStyle.dash ? { dash: strokeStyle.dash } : {}),
    }]
  }
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
      typeof payload.cornerRadius === 'number' && Number.isFinite(payload.cornerRadius)
        ? Math.max(0, Math.min(payload.cornerRadius, Math.min(geometry.width, geometry.height) / 2))
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
  const corners = polygonCorners(shape, geometry, payload)
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

export function freehandNodes(layer: PencilLayer | MarkerLayer): readonly RenderNode[] {
  const payload = layer.payload
  const geometry = resolveFreehandGeometry(payload, layer.kind === 'pencil')
  const points = geometry.points
  const style = {
    color: color(payload.color),
    width: geometry.width,
    cap: 'round' as const,
    join: 'round' as const,
  }
  if (geometry.outline.length) {
    return [{
      kind: 'polygon', id: `${layer.id}:stroke`,
      points: geometry.outline.map((point) => ({
        x: layer.transform.translateX + point.x, y: layer.transform.translateY + point.y,
      })),
      rotation: layer.transform.rotation, opacity: layer.opacity, visible: layer.visible,
      blendMode: layer.blendMode ?? 'normal', fill: style.color,
    }]
  }
  if (points.length === 1) {
    const radius = Math.max(0.5, (style.width * (layer.kind === 'pencil' && !geometry.modern ? points[0]!.pressure : 1)) / 2)
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
  if (layer.kind === 'marker' || geometry.modern) {
    return [
      {
        kind: 'path' as const,
        id: `${layer.id}:stroke`,
        points: points.map((point) =>
          Object.freeze({
            x: layer.transform.translateX + point.x,
            y: layer.transform.translateY + point.y,
          })),
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
    }))
}
