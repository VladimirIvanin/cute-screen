import type { RenderNode, RenderSceneSnapshot } from '@cute-screen/editor-core'
import { scaledOutputSize } from '../../precision-rendering'
import type { InvalidationReason } from '../../scheduler'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
  RenderExportOptions,
} from '../../types'
import type {
  Canvas2DImageResource,
  Canvas2DLike,
  Canvas2DRendererOptions,
} from './contracts'
import { drawNodes2D } from './nodes'
import { defaultCanvas } from './paint'
import { drawScene2D } from './scene'

export class Canvas2DRenderer implements Renderer {
  readonly backend = 'canvas2d' as const
  readonly #now: () => number
  readonly #exportCanvas?: Canvas2DRendererOptions['exportCanvas']
  readonly #resolveFontFamily: NonNullable<
    Canvas2DRendererOptions['resolveFontFamily']
  >
  readonly #resources = new Map<string, Canvas2DImageResource>()
  #stack: CanvasStack | undefined
  #scene: RenderSceneSnapshot | undefined
  #overlay: readonly RenderNode[] = []
  #disposed = false

  constructor(options: Canvas2DRendererOptions = {}) {
    this.#now = options.now ?? (() => performance.now())
    this.#exportCanvas = options.exportCanvas
    this.#resolveFontFamily =
      options.resolveFontFamily ?? ((_text, style) => style.fontFamily)
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
      const bounds = scene.outputBounds
      stack.overlay.width = Math.max(1, Math.round(bounds.width))
      stack.overlay.height = Math.max(1, Math.round(bounds.height))
      const context = stack.overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, stack.overlay.width, stack.overlay.height)
      context.setTransform(1, 0, 0, 1, -bounds.x, -bounds.y)
      drawNodes2D(
        context,
        this.#overlay,
        this.#resourceSources(),
        this.#resolveFontFamily,
      )
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

  async exportPng(options: RenderExportOptions = {}): Promise<Uint8Array> {
    this.#assertReady()
    const scene = this.#scene!
    const scale = options.scale ?? 1
    const size = scaledOutputSize(scene.outputBounds, scale)
    const target = this.#newCanvas(size.width, size.height)
    this.#drawScene(target, scene, scale)
    if (target.encode) return target.encode('png')
    return this.#blobBytes(target)
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const resource of this.#resources.values()) resource.dispose()
    this.#resources.clear()
    this.#stack = undefined
    this.#scene = undefined
  }

  #drawScene(
    canvas: Canvas2DLike,
    scene: RenderSceneSnapshot,
    scale = 1,
  ): void {
    drawScene2D(
      canvas,
      scene,
      scale,
      this.#resources,
      this.#resourceSources(),
      (width, height) => this.#newCanvas(width, height),
      this.#resolveFontFamily,
    )
  }

  #newCanvas(width: number, height: number): Canvas2DLike {
    return (this.#exportCanvas ?? defaultCanvas)(width, height)
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

  #resourceSources(): ReadonlyMap<string, ImageResourceInput['source']> {
    return new Map(
      [...this.#resources.entries()].map(([id, resource]) => [
        id,
        resource.source,
      ]),
    )
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
