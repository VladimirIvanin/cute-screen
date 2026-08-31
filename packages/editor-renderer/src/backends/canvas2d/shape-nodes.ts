import type { RenderNode } from '@cute-screen/editor-core'
import type { ImageResourceInput } from '../../types'
import type { Context2D } from './contracts'
import { cssColor, paintStyle, withTransform } from './paint'
import { roundedRectPath } from './paths'

type Node<K extends RenderNode['kind']> = Extract<RenderNode, { kind: K }>
type Resources = ReadonlyMap<string, ImageResourceInput['source']>

function configureStroke(
  context: Context2D,
  node: Node<'rect' | 'ellipse' | 'polygon'>,
): void {
  context.strokeStyle = cssColor(node.stroke!)
  context.lineWidth = node.strokeWidth ?? 1
  context.lineJoin = node.lineJoin ?? 'miter'
}

export function drawRectNode2D(
  context: Context2D,
  node: Node<'rect'>,
  resources: Resources,
): void {
  const rounded = (node.cornerRadius ?? 0) > 0
  withTransform(
    context,
    node,
    node.x + node.width / 2,
    node.y + node.height / 2,
    () => {
      context.fillStyle = paintStyle(context, node.fill, resources)
      if (rounded) {
        roundedRectPath(
          context,
          node.x,
          node.y,
          node.width,
          node.height,
          node.cornerRadius ?? 0,
        )
        context.fill()
      } else {
        context.fillRect(node.x, node.y, node.width, node.height)
      }
      if (!node.stroke || (node.strokeWidth ?? 0) <= 0) return
      configureStroke(context, node)
      if (rounded) context.stroke()
      else context.strokeRect(node.x, node.y, node.width, node.height)
    },
  )
}

export function drawEllipseNode2D(
  context: Context2D,
  node: Node<'ellipse'>,
  resources: Resources,
): void {
  withTransform(context, node, node.centerX, node.centerY, () => {
    context.beginPath()
    context.ellipse(
      node.centerX,
      node.centerY,
      node.radiusX,
      node.radiusY,
      0,
      0,
      Math.PI * 2,
    )
    context.fillStyle = paintStyle(context, node.fill, resources)
    context.fill()
    if (!node.stroke || (node.strokeWidth ?? 0) <= 0) return
    configureStroke(context, node)
    context.stroke()
  })
}

function configureLine(context: Context2D, node: Node<'line' | 'path'>): void {
  context.strokeStyle = cssColor(node.stroke)
  context.lineWidth = node.strokeWidth
  context.lineCap = node.lineCap ?? 'butt'
  context.lineJoin = node.lineJoin ?? 'miter'
  context.setLineDash(node.dash ? [...node.dash] : [])
  context.stroke()
}

export function drawLineNode2D(context: Context2D, node: Node<'line'>): void {
  withTransform(
    context,
    node,
    (node.x1 + node.x2) / 2,
    (node.y1 + node.y2) / 2,
    () => {
      context.beginPath()
      context.moveTo(node.x1, node.y1)
      context.lineTo(node.x2, node.y2)
      configureLine(context, node)
    },
  )
}

export function drawPathNode2D(context: Context2D, node: Node<'path'>): void {
  const xs = node.points.map((point) => point.x)
  const ys = node.points.map((point) => point.y)
  withTransform(
    context,
    node,
    (Math.min(...xs) + Math.max(...xs)) / 2,
    (Math.min(...ys) + Math.max(...ys)) / 2,
    () => {
      context.beginPath()
      context.moveTo(node.points[0]!.x, node.points[0]!.y)
      for (const point of node.points.slice(1)) context.lineTo(point.x, point.y)
      configureLine(context, node)
    },
  )
}

export function drawPolygonNode2D(
  context: Context2D,
  node: Node<'polygon'>,
  resources: Resources,
): void {
  const centerX =
    node.points.reduce((sum, point) => sum + point.x, 0) / node.points.length
  const centerY =
    node.points.reduce((sum, point) => sum + point.y, 0) / node.points.length
  withTransform(context, node, centerX, centerY, () => {
    context.beginPath()
    context.moveTo(node.points[0]!.x, node.points[0]!.y)
    for (const point of node.points.slice(1)) context.lineTo(point.x, point.y)
    context.closePath()
    context.fillStyle = paintStyle(context, node.fill, resources)
    context.fill()
    if (!node.stroke || (node.strokeWidth ?? 0) <= 0) return
    configureStroke(context, node)
    context.stroke()
  })
}
