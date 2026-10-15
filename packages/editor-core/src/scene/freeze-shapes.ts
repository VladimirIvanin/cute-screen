import type {
  RenderEllipseNode,
  RenderImageNode,
  RenderLineNode,
  RenderPathNode,
  RenderPolygonNode,
  RenderRectNode,
  RenderVectorNode,
} from './contracts'
import {
  assertFinite,
  assertNonNegative,
  assertPositive,
  freezeColor,
  freezePaint,
  validateStrokeStyle,
} from './validation'

export function freezeVectorNode(node: RenderVectorNode): RenderVectorNode {
  assertFinite(node.x, `${node.id}.x`)
  assertFinite(node.y, `${node.id}.y`)
  assertPositive(node.width, `${node.id}.width`)
  assertPositive(node.height, `${node.id}.height`)
  assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  const freezePath = (path: RenderVectorNode['outline'], required: boolean): RenderVectorNode['outline'] => {
    if (
      (required ||
        path.length) &&
        path[0]?.[0] !== 'M'
    ) throw new RangeError('vector path must begin with M')
    return Object.freeze(path.map((command) => {
      const size = command[0] === 'C' ? 7 : command[0] === 'Z' ? 1 : 3
      if (!['M', 'L', 'C', 'Z'].includes(command[0]) || command.length !== size) throw new RangeError('invalid vector command')
      command.slice(1).forEach((value) => assertFinite(value as number, `${node.id}.path`))
      return Object.freeze([...command]) as typeof command
    }))
  }
  validateStrokeStyle(node)
  return Object.freeze({ ...node,
    outline: freezePath(node.outline, true), details: freezePath(node.details, false),
    fill: freezePaint(node.fill, `${node.id}.fill`), stroke: freezeColor(node.stroke),
    ...(node.dash ? { dash: Object.freeze([...node.dash]) } : {}),
  })
}

export function freezeRectNode(node: RenderRectNode): RenderRectNode {
  assertFinite(node.x, `${node.id}.x`)
  assertFinite(node.y, `${node.id}.y`)
  assertPositive(node.width, `${node.id}.width`)
  assertPositive(node.height, `${node.id}.height`)
  if (node.cornerRadius !== undefined) {
    assertNonNegative(node.cornerRadius, `${node.id}.cornerRadius`)
    if (node.cornerRadius > Math.min(node.width, node.height) / 2) {
      throw new RangeError(`${node.id}.cornerRadius exceeds its bounds`)
    }
  }
  if (node.strokeWidth !== undefined) {
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  }
  return Object.freeze({
    ...node,
    fill: freezePaint(node.fill, `${node.id}.fill`),
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

export function freezeEllipseNode(node: RenderEllipseNode): RenderEllipseNode {
  assertFinite(node.centerX, `${node.id}.centerX`)
  assertFinite(node.centerY, `${node.id}.centerY`)
  assertPositive(node.radiusX, `${node.id}.radiusX`)
  assertPositive(node.radiusY, `${node.id}.radiusY`)
  if (node.strokeWidth !== undefined) {
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  }
  return Object.freeze({
    ...node,
    fill: freezePaint(node.fill, `${node.id}.fill`),
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

export function freezeLineNode(node: RenderLineNode): RenderLineNode {
  assertFinite(node.x1, `${node.id}.x1`)
  assertFinite(node.y1, `${node.id}.y1`)
  assertFinite(node.x2, `${node.id}.x2`)
  assertFinite(node.y2, `${node.id}.y2`)
  assertPositive(node.strokeWidth, `${node.id}.strokeWidth`)
  validateStrokeStyle(node)
  return Object.freeze({ ...node, stroke: freezeColor(node.stroke) })
}

export function freezePathNode(node: RenderPathNode): RenderPathNode {
  if (node.points.length < 2) throw new RangeError(`${node.id}.points must contain at least 2 entries`)
  assertPositive(node.strokeWidth, `${node.id}.strokeWidth`)
  validateStrokeStyle(node)
  const points = node.points.map((point, index) => {
    assertFinite(point.x, `${node.id}.points[${index}].x`)
    assertFinite(point.y, `${node.id}.points[${index}].y`)
    return Object.freeze({ x: point.x, y: point.y })
  })
  return Object.freeze({
    ...node,
    points: Object.freeze(points),
    stroke: freezeColor(node.stroke),
  })
}

export function freezePolygonNode(node: RenderPolygonNode): RenderPolygonNode {
  if (node.points.length < 3) throw new RangeError(`${node.id}.points must contain at least 3 entries`)
  if (node.strokeWidth !== undefined) assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  const points = node.points.map((point, index) => {
    assertFinite(point.x, `${node.id}.points[${index}].x`)
    assertFinite(point.y, `${node.id}.points[${index}].y`)
    return Object.freeze({ x: point.x, y: point.y })
  })
  return Object.freeze({
    ...node,
    points: Object.freeze(points),
    fill: freezePaint(node.fill, `${node.id}.fill`),
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

export function freezeImageNode(node: RenderImageNode): RenderImageNode {
  if (!node.resourceId) throw new Error(`${node.id}.resourceId must not be empty`)
  assertFinite(node.x, `${node.id}.x`)
  assertFinite(node.y, `${node.id}.y`)
  assertPositive(node.width, `${node.id}.width`)
  assertPositive(node.height, `${node.id}.height`)
  if (!Number.isFinite(node.scaleX) || node.scaleX === 0) {
    throw new RangeError(`${node.id}.scaleX must be finite and non-zero`)
  }
  if (!Number.isFinite(node.scaleY) || node.scaleY === 0) {
    throw new RangeError(`${node.id}.scaleY must be finite and non-zero`)
  }
  if (node.cornerRadius !== undefined) {
    assertNonNegative(node.cornerRadius, `${node.id}.cornerRadius`)
    if (node.cornerRadius > Math.min(node.width, node.height) / 2) {
      throw new RangeError(`${node.id}.cornerRadius exceeds its bounds`)
    }
  }
  if (node.strokeWidth !== undefined) {
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  }
  if (node.lineJoin !== undefined && !['miter', 'round', 'bevel'].includes(node.lineJoin)) {
    throw new RangeError(`${node.id}.lineJoin is invalid`)
  }
  return Object.freeze({
    ...node,
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}
