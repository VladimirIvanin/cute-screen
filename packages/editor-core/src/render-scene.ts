export interface RgbaColor {
  readonly red: number
  readonly green: number
  readonly blue: number
  readonly alpha: number
}

interface RenderNodeBase {
  readonly id: string
  readonly rotation: number
  readonly opacity: number
  readonly visible: boolean
}

export interface RenderRectNode extends RenderNodeBase {
  readonly kind: 'rect'
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly fill: RgbaColor
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
}

export interface RenderEllipseNode extends RenderNodeBase {
  readonly kind: 'ellipse'
  readonly centerX: number
  readonly centerY: number
  readonly radiusX: number
  readonly radiusY: number
  readonly fill: RgbaColor
  readonly stroke?: RgbaColor
  readonly strokeWidth?: number
}

export interface RenderLineNode extends RenderNodeBase {
  readonly kind: 'line'
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly stroke: RgbaColor
  readonly strokeWidth: number
}

/** Raster layers share the ordered scene graph with annotation nodes. */
export interface RenderImageNode extends RenderNodeBase {
  readonly kind: 'image'
  readonly resourceId: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly scaleX: number
  readonly scaleY: number
}

export type RenderNode =
  RenderRectNode | RenderEllipseNode | RenderLineNode | RenderImageNode

export interface RenderSceneSnapshot {
  readonly width: number
  readonly height: number
  readonly nodes: readonly RenderNode[]
}

export type RenderSceneInput = Omit<RenderSceneSnapshot, 'nodes'> & {
  readonly nodes: readonly RenderNode[]
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`)
}

function assertPositive(value: number, field: string): void {
  assertFinite(value, field)
  if (value <= 0) throw new RangeError(`${field} must be positive`)
}

function assertNonNegative(value: number, field: string): void {
  assertFinite(value, field)
  if (value < 0) throw new RangeError(`${field} must be non-negative`)
}

function freezeColor(color: RgbaColor): RgbaColor {
  const channels = [
    ['red', color.red],
    ['green', color.green],
    ['blue', color.blue],
    ['alpha', color.alpha],
  ] as const
  for (const [channel, value] of channels) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${channel} color channel must be between 0 and 1`)
    }
  }
  return Object.freeze({ ...color })
}

function assertNodeBase(node: RenderNode): void {
  if (!node.id) throw new Error('Render node id must not be empty')
  assertFinite(node.rotation, `${node.id}.rotation`)
  if (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1) {
    throw new RangeError(
      `Render node ${node.id} opacity must be between 0 and 1`,
    )
  }
}

function freezeRectNode(node: RenderRectNode): RenderRectNode {
  assertFinite(node.x, `${node.id}.x`)
  assertFinite(node.y, `${node.id}.y`)
  assertPositive(node.width, `${node.id}.width`)
  assertPositive(node.height, `${node.id}.height`)
  if (node.strokeWidth !== undefined) {
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  }
  return Object.freeze({
    ...node,
    fill: freezeColor(node.fill),
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

function freezeEllipseNode(node: RenderEllipseNode): RenderEllipseNode {
  assertFinite(node.centerX, `${node.id}.centerX`)
  assertFinite(node.centerY, `${node.id}.centerY`)
  assertPositive(node.radiusX, `${node.id}.radiusX`)
  assertPositive(node.radiusY, `${node.id}.radiusY`)
  if (node.strokeWidth !== undefined) {
    assertNonNegative(node.strokeWidth, `${node.id}.strokeWidth`)
  }
  return Object.freeze({
    ...node,
    fill: freezeColor(node.fill),
    ...(node.stroke === undefined ? {} : { stroke: freezeColor(node.stroke) }),
  })
}

function freezeLineNode(node: RenderLineNode): RenderLineNode {
  assertFinite(node.x1, `${node.id}.x1`)
  assertFinite(node.y1, `${node.id}.y1`)
  assertFinite(node.x2, `${node.id}.x2`)
  assertFinite(node.y2, `${node.id}.y2`)
  assertPositive(node.strokeWidth, `${node.id}.strokeWidth`)
  return Object.freeze({ ...node, stroke: freezeColor(node.stroke) })
}

function freezeImageNode(node: RenderImageNode): RenderImageNode {
  if (!node.resourceId)
    throw new Error(`${node.id}.resourceId must not be empty`)
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
  return Object.freeze({ ...node })
}

function assertNever(value: never): never {
  throw new Error(`unsupported render node: ${String(value)}`)
}

function freezeNode(node: RenderNode): RenderNode {
  assertNodeBase(node)
  switch (node.kind) {
    case 'rect':
      return freezeRectNode(node)
    case 'ellipse':
      return freezeEllipseNode(node)
    case 'line':
      return freezeLineNode(node)
    case 'image':
      return freezeImageNode(node)
    default:
      return assertNever(node)
  }
}

export function createRenderSceneSnapshot(
  input: RenderSceneInput,
): RenderSceneSnapshot {
  assertPositive(input.width, 'width')
  assertPositive(input.height, 'height')
  const ids = new Set<string>()
  const nodes = input.nodes.map((node) => {
    if (ids.has(node.id))
      throw new Error(`Duplicate render node id: ${node.id}`)
    ids.add(node.id)
    return freezeNode(node)
  })
  return Object.freeze({
    width: input.width,
    height: input.height,
    nodes: Object.freeze(nodes),
  })
}

/** Compile-time marker for the DOM-free editor package boundary. */
export type EditorCoreBoundary = Readonly<{
  package: 'editor-core'
}>
