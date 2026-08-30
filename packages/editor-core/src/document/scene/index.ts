import type { RenderNode } from '../../scene/contracts'
import { createRenderSceneSnapshot } from '../../scene/snapshot'
import type { EditorDocumentV1, LayerNode } from '../types'
import { arrowNodes } from './arrow'
import { freehandNodes, shapeNodes } from './drawing'
import { precisionNodes } from './precision'
import { stroke } from './shared'
import { calloutNodes, numberedMarkerNodes, textNodes } from './text'

function assertNever(value: never): never {
  throw new Error(`Unsupported document layer: ${String(value)}`)
}

function projectAnnotationLayer(
  layer: Exclude<LayerNode, { readonly kind: 'image' }>,
  document: EditorDocumentV1,
): readonly RenderNode[] {
  switch (layer.kind) {
    case 'arrow':
      return arrowNodes(layer)
    case 'shape':
      return shapeNodes(layer)
    case 'pencil':
    case 'marker':
      return freehandNodes(layer)
    case 'text':
      return textNodes(layer)
    case 'numberedMarker':
      return numberedMarkerNodes(layer)
    case 'callout':
      return calloutNodes(layer)
    case 'censor':
    case 'spotlight':
    case 'ruler':
    case 'loupe':
      return precisionNodes(layer, document)
    case 'emoji':
      return []
    default:
      return assertNever(layer)
  }
}

function imageNode(
  layer: Extract<LayerNode, { readonly kind: 'image' }>,
): RenderNode {
  const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
  const imageBorder = layer.payload.border
    ? stroke(layer.payload.border)
    : undefined
  const imageRadius = Math.max(
    0,
    Math.min(layer.payload.radius ?? 0, bounds.width / 2, bounds.height / 2),
  )
  return {
    id: layer.id,
    kind: 'image',
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
  }
}

/** Converts persisted nodes to renderer-neutral, ordered scene nodes. */
export function createDocumentRenderScene(document: EditorDocumentV1) {
  const nodes: RenderNode[] = []
  for (const layer of document.layers) {
    if (layer.kind === 'image') {
      nodes.push(imageNode(layer))
      continue
    }
    nodes.push(
      ...projectAnnotationLayer(layer, document).map((node) => ({
        ...node,
        scaleX: layer.transform.scaleX,
        scaleY: layer.transform.scaleY,
        transformOriginX: layer.transform.translateX,
        transformOriginY: layer.transform.translateY,
      })),
    )
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
