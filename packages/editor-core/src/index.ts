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

export type RenderNode = RenderRectNode | RenderEllipseNode | RenderLineNode

export interface RenderBackgroundRef {
  readonly resourceId: string
  readonly width: number
  readonly height: number
}

export interface RenderSceneSnapshot {
  readonly width: number
  readonly height: number
  readonly background?: RenderBackgroundRef
  readonly nodes: readonly RenderNode[]
}

export type RenderSceneInput = Omit<RenderSceneSnapshot, 'nodes'> & {
  readonly nodes: readonly RenderNode[]
}

function assertPositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${field} must be a positive finite number`)
  }
}

function freezeColor(color: RgbaColor): RgbaColor {
  for (const [channel, value] of Object.entries(color)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${channel} color channel must be between 0 and 1`)
    }
  }
  return Object.freeze({ ...color })
}

function freezeNode(node: RenderNode): RenderNode {
  if (!node.id) throw new Error('Render node id must not be empty')
  if (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1) {
    throw new RangeError(
      `Render node ${node.id} opacity must be between 0 and 1`,
    )
  }

  switch (node.kind) {
    case 'rect': {
      assertPositive(node.width, `${node.id}.width`)
      assertPositive(node.height, `${node.id}.height`)
      const frozen = {
        ...node,
        fill: freezeColor(node.fill),
        ...(node.stroke ? { stroke: freezeColor(node.stroke) } : {}),
      }
      return Object.freeze(frozen)
    }
    case 'ellipse': {
      assertPositive(node.radiusX, `${node.id}.radiusX`)
      assertPositive(node.radiusY, `${node.id}.radiusY`)
      const frozen = {
        ...node,
        fill: freezeColor(node.fill),
        ...(node.stroke ? { stroke: freezeColor(node.stroke) } : {}),
      }
      return Object.freeze(frozen)
    }
    case 'line':
      assertPositive(node.strokeWidth, `${node.id}.strokeWidth`)
      return Object.freeze({ ...node, stroke: freezeColor(node.stroke) })
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

  const background = input.background
    ? Object.freeze({ ...input.background })
    : undefined
  if (background) {
    assertPositive(background.width, 'background.width')
    assertPositive(background.height, 'background.height')
  }

  return Object.freeze({
    width: input.width,
    height: input.height,
    ...(background ? { background } : {}),
    nodes: Object.freeze(nodes),
  })
}

/** Compile-time marker for the DOM-free editor package boundary. */
export type EditorCoreBoundary = Readonly<{
  package: 'editor-core'
}>
