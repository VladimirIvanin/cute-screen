import { createRenderSceneSnapshot, type RenderNode } from '../render-scene'
import type { EditorDocumentV1 } from './types'

/** Converts persisted nodes to renderer-neutral, ordered scene nodes. */
export function createDocumentRenderScene(document: EditorDocumentV1) {
  const nodes: RenderNode[] = document.layers.flatMap((layer) => {
    if (layer.kind !== 'image') return []
    const bounds = layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
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
      },
    ]
  })
  return createRenderSceneSnapshot({
    width: document.canvas.width,
    height: document.canvas.height,
    nodes,
  })
}
