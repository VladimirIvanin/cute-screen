import type {
  RenderNode,
  RenderSceneSnapshot,
  RgbaColor,
} from '@cute-screen/editor-core'

import type { InvalidationReason } from './scheduler'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
} from './types'

type Context2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'drawImage'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'ellipse'
  | 'moveTo'
  | 'lineTo'
  | 'fill'
  | 'stroke'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'setTransform'
  | 'globalAlpha'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
>

export interface Canvas2DLike {
  width: number
  height: number
  getContext(type: '2d'): Context2D | null
  toBlob?: (callback: BlobCallback, type?: string) => void
  encode?: (format: 'png') => Promise<Uint8Array>
}

interface Canvas2DImageResource extends ImageResource {
  readonly source: ImageResourceInput['source']
}

export interface Canvas2DRendererOptions {
  readonly now?: () => number
  readonly exportCanvas?: (width: number, height: number) => Canvas2DLike
}

function cssColor(color: RgbaColor): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(
    color.green * 255,
  )}, ${Math.round(color.blue * 255)}, ${color.alpha})`
}

function withRotation(
  context: Context2D,
  node: RenderNode,
  centerX: number,
  centerY: number,
  draw: () => void,
): void {
  context.save()
  context.globalAlpha = node.opacity
  if (node.rotation !== 0) {
    context.translate(centerX, centerY)
    context.rotate((node.rotation * Math.PI) / 180)
    context.translate(-centerX, -centerY)
  }
  draw()
  context.restore()
}

export function drawNodes2D(
  context: Context2D,
  nodes: readonly RenderNode[],
): void {
  for (const node of nodes) {
    if (!node.visible || node.opacity === 0) continue
    switch (node.kind) {
      case 'rect': {
        const centerX = node.x + node.width / 2
        const centerY = node.y + node.height / 2
        withRotation(context, node, centerX, centerY, () => {
          context.fillStyle = cssColor(node.fill)
          context.fillRect(node.x, node.y, node.width, node.height)
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.strokeRect(node.x, node.y, node.width, node.height)
          }
        })
        break
      }
      case 'ellipse':
        withRotation(context, node, node.centerX, node.centerY, () => {
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
          context.fillStyle = cssColor(node.fill)
          context.fill()
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.stroke()
          }
        })
        break
      case 'line': {
        const centerX = (node.x1 + node.x2) / 2
        const centerY = (node.y1 + node.y2) / 2
        withRotation(context, node, centerX, centerY, () => {
          context.beginPath()
          context.moveTo(node.x1, node.y1)
          context.lineTo(node.x2, node.y2)
          context.strokeStyle = cssColor(node.stroke)
          context.lineWidth = node.strokeWidth
          context.stroke()
        })
        break
      }
      case 'image':
        // Image resources are resolved by the renderer; no placeholder is drawn
        // here so overlays stay independent from committed scene rendering.
        break
    }
  }
}

export class Canvas2DRenderer implements Renderer {
  readonly backend = 'canvas2d' as const
  readonly #now: () => number
  readonly #exportCanvas?: Canvas2DRendererOptions['exportCanvas']
  readonly #resources = new Map<string, Canvas2DImageResource>()
  #stack: CanvasStack | undefined
  #scene: RenderSceneSnapshot | undefined
  #overlay: readonly RenderNode[] = []
  #disposed = false

  constructor(options: Canvas2DRendererOptions = {}) {
    this.#now = options.now ?? (() => performance.now())
    this.#exportCanvas = options.exportCanvas
  }

  async initialize(stack: CanvasStack): Promise<void> {
    this.#assertActive()
    if (!stack.scene.getContext('2d') || !stack.overlay.getContext('2d')) {
      throw new Error('Canvas2D context is unavailable')
    }
    this.#stack = stack
  }

  async createImageResource(input: ImageResourceInput): Promise<ImageResource> {
    this.#assertActive()
    const resource: Canvas2DImageResource = {
      ...input,
      dispose: () => this.#resources.delete(input.id),
    }
    this.#resources.set(resource.id, resource)
    return resource
  }

  setScene(scene: RenderSceneSnapshot): void {
    this.#assertActive()
    this.#scene = scene
  }

  setOverlay(nodes: readonly RenderNode[]): void {
    this.#assertActive()
    this.#overlay = nodes
  }

  render(reasons: readonly InvalidationReason[]): FrameMetric {
    this.#assertReady()
    const startedAt = this.#now()
    const scene = this.#scene!
    const stack = this.#stack!
    if (
      reasons.some((reason) =>
        ['scene', 'viewport', 'resource', 'export'].includes(reason),
      )
    ) {
      this.#drawScene(stack.scene, scene)
    }
    if (reasons.includes('overlay') || reasons.includes('viewport')) {
      const context = stack.overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, stack.overlay.width, stack.overlay.height)
      drawNodes2D(context, this.#overlay)
    }
    return {
      backend: this.backend,
      correlationId: stack.correlationId,
      reasons: [...reasons],
      nodeCount: scene.nodes.length + this.#overlay.length,
      startedAt,
      duration: this.#now() - startedAt,
    }
  }

  async exportPng(): Promise<Uint8Array> {
    this.#assertReady()
    const scene = this.#scene!
    const target = this.#exportCanvas?.(scene.width, scene.height)
    if (target) {
      this.#drawScene(target, scene)
      if (target.encode) return target.encode('png')
      return this.#blobBytes(target)
    }
    return this.#blobBytes(this.#stack!.scene)
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const resource of this.#resources.values()) resource.dispose()
    this.#resources.clear()
    this.#stack = undefined
    this.#scene = undefined
  }

  #drawScene(canvas: Canvas2DLike, scene: RenderSceneSnapshot): void {
    canvas.width = scene.width
    canvas.height = scene.height
    const context = canvas.getContext('2d')!
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, canvas.width, canvas.height)
    for (const node of scene.nodes) {
      if (node.kind !== 'image') {
        drawNodes2D(context, [node])
        continue
      }
      if (!node.visible || node.opacity === 0) continue
      const resource = this.#resources.get(node.resourceId)
      context.save()
      context.globalAlpha = node.opacity
      context.translate(node.x, node.y)
      context.rotate((node.rotation * Math.PI) / 180)
      context.scale(node.scaleX, node.scaleY)
      if (resource) {
        context.drawImage(resource.source, 0, 0, node.width, node.height)
      } else {
        // A missing blob is a recoverable per-resource failure: preserve the
        // canvas and history while making the affected bounds visible.
        // Match CanvasKit's 0.72/0.28/0.28 placeholder color exactly after
        // its 8-bit conversion, so fallback and headless output stay stable.
        context.fillStyle = 'rgba(184, 71, 71, 0.16)'
        context.strokeStyle = 'rgba(184, 71, 71, 0.9)'
        context.lineWidth = 1
        context.fillRect(0, 0, node.width, node.height)
        context.strokeRect(0, 0, node.width, node.height)
      }
      context.restore()
    }
  }

  async #blobBytes(canvas: Canvas2DLike): Promise<Uint8Array> {
    if (!canvas.toBlob) throw new Error('Canvas PNG encoding is unavailable')
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob!((value) => {
        if (value) resolve(value)
        else reject(new Error('Canvas PNG encoding failed'))
      }, 'image/png')
    })
    return new Uint8Array(await blob.arrayBuffer())
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Canvas2D renderer is disposed')
  }

  #assertReady(): void {
    this.#assertActive()
    if (!this.#stack) throw new Error('Canvas2D renderer is not initialized')
    if (!this.#scene) throw new Error('Canvas2D renderer has no scene')
  }
}
