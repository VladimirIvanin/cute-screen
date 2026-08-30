import type {
  RenderNode,
  RenderSceneInput,
  RenderSceneSnapshot,
} from './contracts'
import {
  freezeEllipseNode,
  freezeImageNode,
  freezeLineNode,
  freezePathNode,
  freezePolygonNode,
  freezeRectNode,
} from './freeze-shapes'
import { freezeTextNode } from './freeze-text'
import {
  freezeCensorNode,
  freezeLoupeNode,
  freezeRulerNode,
  freezeSpotlightNode,
} from './freeze-precision'
import { assertNodeBase, assertNonNegative, assertPositive } from './validation'

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
    case 'path':
      return freezePathNode(node)
    case 'polygon':
      return freezePolygonNode(node)
    case 'image':
      return freezeImageNode(node)
    case 'text':
      return freezeTextNode(node)
    case 'censor':
      return freezeCensorNode(node)
    case 'spotlight':
      return freezeSpotlightNode(node)
    case 'ruler':
      return freezeRulerNode(node)
    case 'loupe':
      return freezeLoupeNode(node)
    default:
      return assertNever(node)
  }
}

export function createRenderSceneSnapshot(
  input: RenderSceneInput,
): RenderSceneSnapshot {
  assertPositive(input.width, 'width')
  assertPositive(input.height, 'height')
  const outputBounds = input.outputBounds ?? {
    x: 0,
    y: 0,
    width: input.width,
    height: input.height,
  }
  assertNonNegative(outputBounds.x, 'outputBounds.x')
  assertNonNegative(outputBounds.y, 'outputBounds.y')
  assertPositive(outputBounds.width, 'outputBounds.width')
  assertPositive(outputBounds.height, 'outputBounds.height')
  if (
    outputBounds.x + outputBounds.width > input.width ||
    outputBounds.y + outputBounds.height > input.height
  ) {
    throw new RangeError('outputBounds must remain inside the scene canvas')
  }
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
    outputBounds: Object.freeze({ ...outputBounds }),
    nodes: Object.freeze(nodes),
  })
}

/** Compile-time marker for the DOM-free editor package boundary. */
