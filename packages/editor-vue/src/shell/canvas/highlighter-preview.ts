import {
  createDocumentRenderScene,
  drawNodes2D,
  type LayerNode,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import type { ViewportOutputBounds } from './contracts'

/** Blend against committed pixels, restoring only the preceding stroke's damaged region. */
export class HighlighterPreview {
  private backdrop: HTMLCanvasElement | undefined
  private dirty: { x: number; y: number; width: number; height: number } | undefined

  constructor(private readonly createCanvas = () => document.createElement('canvas')) {}

  invalidate(): void {
    if (this.backdrop) {
      this.backdrop.width = 0
      this.backdrop.height = 0
    }
    this.backdrop = undefined
    this.dirty = undefined
  }

  draw(
    scene: HTMLCanvasElement,
    layer: LayerNode | undefined,
    bounds: ViewportOutputBounds,
    document: EditorDocumentV1,
  ): boolean {
    const context = scene.getContext('2d')
    if (!context) return false
    if (
      this.backdrop &&
      (this.backdrop.width !== scene.width ||
        this.backdrop.height !== scene.height)
    ) this.invalidate()
    if (!layer && !this.backdrop) return false
    if (!this.backdrop) {
      this.backdrop = this.createCanvas()
      this.backdrop.width = scene.width
      this.backdrop.height = scene.height
      const copy = this.backdrop.getContext('2d')
      if (!copy) {
        this.invalidate()
        return false
      }
      copy.drawImage(scene, 0, 0)
    }
    context.save()
    try {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.globalCompositeOperation = 'source-over'
      context.globalAlpha = 1
      if (this.dirty) {
        const { x, y, width, height } = this.dirty
        context.clearRect(x, y, width, height)
        context.drawImage(this.backdrop, x, y, width, height, x, y, width, height)
      }
      if (!layer) {
        this.invalidate()
        return true
      }
      const b = layer.localBounds
      this.dirty = {
        x: Math.floor(layer.transform.translateX + b.x - bounds.x) - 2,
        y: Math.floor(layer.transform.translateY + b.y - bounds.y) - 2,
        width: Math.ceil(b.width) + 4,
        height: Math.ceil(b.height) + 4,
      }
      context.translate(-bounds.x, -bounds.y)
      // The compiler is the same one used for committed freehand nodes.
      const nodes = createDocumentRenderScene({ ...document, crop: null, layers: [layer] }).nodes
      drawNodes2D(context, nodes)
      return true
    } finally {
      context.restore()
    }
  }
}
