import type {
  RenderNode,
  RenderSceneSnapshot,
} from '@cute-screen/editor-core'
import { scaledOutputSize } from '../../precision-rendering'
import type { InvalidationReason } from '../../scheduler'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  EffectPreparationRenderer,
  RenderExportOptions,
  PrepareEffectsOptions,
} from '../../types'
import type {
  Canvas2DImageResource,
  Canvas2DLike,
  Canvas2DRendererOptions,
} from './contracts'
import { drawNodes2D } from './nodes'
import { defaultCanvas } from './paint'
import {
  drawScene2D,
  drawScene2DSteps,
} from './scene'
import { releaseOuterShadowCache } from './outer-shadow'
import {
  EffectCache,
  hasPixelEffects,
  releaseCanvas,
  type EffectMode,
} from '../../effects/runtime'
import {
  EffectWorker,
  effectCancelled,
} from '../../effects/worker'

export class Canvas2DRenderer implements EffectPreparationRenderer {
  readonly backend = 'canvas2d' as const
  readonly #now: () => number
  readonly #exportCanvas?: Canvas2DRendererOptions['exportCanvas']
  readonly #resolveFontFamily: NonNullable<Canvas2DRendererOptions['resolveFontFamily']>
  readonly #resources = new Map<string, Canvas2DImageResource>()
  #stack: CanvasStack | undefined
  #scene: RenderSceneSnapshot | undefined
  #overlay: readonly RenderNode[] = []
  #disposed = false
  #previewScale = 1
  readonly #effects = new EffectCache()
  readonly #worker = new EffectWorker()
  #renderMode: EffectMode = 'settled'
  #exportTail: Promise<void> = Promise.resolve()
  #exportAbort: AbortController | undefined
  #preparation: AbortController | undefined
  #prepared: { scene: RenderSceneSnapshot; scale: number; canvas: Canvas2DLike } | undefined
  readonly #surfaceFactory = (width: number, height: number): Canvas2DLike => this.#newCanvas(width, height)

  constructor(options: Canvas2DRendererOptions = {}) {
    this.#now = options.now ?? (() => performance.now())
    this.#exportCanvas = options.exportCanvas
    this.#resolveFontFamily = options.resolveFontFamily ?? ((_text, style) => style.fontFamily)
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
    this.clearEffectCache()
    const resource: Canvas2DImageResource = {
      ...input,
      dispose: () => {
        if (this.#resources.get(input.id) === resource) {
          this.#resources.delete(input.id)
          this.clearEffectCache()
        }
      },
    }
    this.#resources.set(resource.id, resource)
    return resource
  }

  setScene(scene: RenderSceneSnapshot): void {
    this.#assertActive()
    if (this.#scene !== scene) this.#clearPrepared()
    this.#scene = scene
  }

  setRenderMode(mode: EffectMode): void {
    this.#assertActive()
    if (this.#renderMode !== mode) this.#clearPrepared()
    this.#renderMode = mode
    if (!this.#exportAbort) this.#effects.mode = mode
  }

  clearEffectCache(): void {
    this.#exportAbort?.abort()
    this.#clearPrepared()
    this.#effects.clear()
  }

  get effectStats() {
    const cache = this.#effects
    return { bytes: cache.bytes, entries: cache.entries.size, hits: cache.hits,
      misses: cache.misses, filteredPixels: cache.filteredPixels,
      censorFilteredPixels: cache.censorFilteredPixels, groupFilteredPixels: cache.groupFilteredPixels,
      temporaryGroupBytes: cache.temporaryGroupBytes, peakTemporaryGroupBytes: cache.peakTemporaryGroupBytes,
      peakFilterScratchBytes: cache.peakFilterScratchBytes,
      preparedBytes: this.#prepared ? this.#prepared.canvas.width * this.#prepared.canvas.height * 4 : 0 }
  }

  async prepareEffects(options: PrepareEffectsOptions = {}): Promise<void> {
    await this.#exportTail
    this.#assertReady()
    if (options.signal?.aborted) throw effectCancelled()
    this.#clearPrepared()
    if (!hasPixelEffects(this.#scene!)) return
    this.#effects.mode = this.#renderMode
    const scene = this.#scene!
    const scale = this.#previewScale
    const controller = new AbortController()
    this.#preparation = controller
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) controller.abort()
    const target = this.#newCanvas(1, 1)
    let retained = false
    try {
      await this.#prepareCanvas(target, scene, scale, controller.signal)
      if (controller.signal.aborted || this.#disposed) throw effectCancelled()
      this.#prepared = { scene, scale, canvas: target }
      retained = true
    } finally {
      options.signal?.removeEventListener('abort', abort)
      if (this.#preparation === controller) this.#preparation = undefined
      if (!retained) releaseCanvas(target)
    }
  }

  setOverlay(nodes: readonly RenderNode[]): void {
    this.#assertActive()
    this.#overlay = nodes
  }

  /** Display density only; export always uses its own explicit scale. */
  setPreviewScale(scale: number): void {
    this.#assertActive()
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('Preview scale must be positive and finite')
    if (scale !== this.#previewScale) this.#clearPrepared()
    this.#previewScale = scale
  }

  render(reasons: readonly InvalidationReason[]): FrameMetric {
    this.#assertReady()
    const startedAt = this.#now()
    const scene = this.#scene!
    const stack = this.#stack!
    if (reasons.some((reason) => ['scene', 'viewport', 'resource', 'export'].includes(reason))) {
      const prepared = this.#prepared
      if (prepared?.scene === scene && prepared.scale === this.#previewScale) {
        stack.scene.width = prepared.canvas.width
        stack.scene.height = prepared.canvas.height
        const context = stack.scene.getContext('2d')!
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.clearRect(0, 0, stack.scene.width, stack.scene.height)
        context.drawImage(prepared.canvas as unknown as CanvasImageSource, 0, 0)
      } else this.#drawScene(stack.scene, scene, this.#previewScale)
    }
    if (reasons.includes('overlay') || reasons.includes('viewport')) {
      const bounds = scene.outputBounds
      const scale = this.#previewScale
      const size = scaledOutputSize(bounds, scale)
      stack.overlay.width = size.width
      stack.overlay.height = size.height
      const context = stack.overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, stack.overlay.width, stack.overlay.height)
      context.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale)
      drawNodes2D(
        context,
        this.#overlay,
        this.#resourceSources(),
        this.#resolveFontFamily,
        this.#surfaceFactory,
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
    const previous = this.#exportTail
    let unlock!: () => void
    this.#exportTail = new Promise<void>((resolve) => {
      unlock = resolve
    })
    await previous
    const controller = new AbortController()
    this.#exportAbort = controller
    const abort = () => controller.abort()
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) controller.abort()
    let target: Canvas2DLike | undefined
    try {
      this.#assertReady()
      this.#clearPrepared()
      this.#effects.mode = 'settled'
      const size = scaledOutputSize(scene.outputBounds, scale)
      target = this.#newCanvas(size.width, size.height)
      await this.#prepareCanvas(target, scene, scale, controller.signal)
      if (target.encode) return await target.encode('png')
      return await this.#blobBytes(target)
    } finally {
      this.#effects.mode = this.#renderMode
      options.signal?.removeEventListener('abort', abort)
      if (this.#exportAbort === controller) this.#exportAbort = undefined
      if (target) releaseCanvas(target)
      unlock()
    }
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.clearEffectCache()
    this.#worker.dispose()
    for (const resource of this.#resources.values()) resource.dispose()
    this.#resources.clear()
    releaseOuterShadowCache(this.#surfaceFactory)
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
      this.#surfaceFactory,
      this.#resolveFontFamily,
      false,
      this.#effects,
    )
  }

  async #prepareCanvas(
    target: Canvas2DLike,
    scene: RenderSceneSnapshot,
    scale: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const steps = drawScene2DSteps(target, scene, scale, this.#resources,
      this.#resourceSources(), this.#surfaceFactory, this.#resolveFontFamily, false, this.#effects)
    try {
      if (signal?.aborted) throw effectCancelled()
      for (const job of steps) {
        await this.#worker.run(job, signal)
        if (signal?.aborted || this.#disposed) throw effectCancelled()
      }
    } finally {
      steps.return()
    }
  }

  #clearPrepared(): void {
    this.#preparation?.abort()
    if (this.#prepared) releaseCanvas(this.#prepared.canvas)
    this.#prepared = undefined
  }

  #newCanvas(
    width: number,
    height: number,
  ): Canvas2DLike {
    return (this.#exportCanvas ?? defaultCanvas)(width, height)
  }

  async #blobBytes(canvas: Canvas2DLike): Promise<Uint8Array> {
    if (canvas.convertToBlob) {
      const blob = await canvas.convertToBlob({ type: 'image/png' })
      return new Uint8Array(await blob.arrayBuffer())
    }
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
    return new Map([...this.#resources.entries()].map(([id, resource]) => [id, resource.source]))
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
