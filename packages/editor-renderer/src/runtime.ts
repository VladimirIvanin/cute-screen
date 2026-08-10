import type { RenderNode, RenderSceneSnapshot } from '@cute-screen/editor-core'

import { FrameScheduler, type InvalidationReason } from './scheduler'
import type {
  CanvasStack,
  FrameProbe,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
  RendererRuntimeState,
} from './types'

type RendererFactory = () => Renderer | Promise<Renderer>

export interface RendererRuntimeOptions {
  readonly stack: CanvasStack
  readonly createPrimary: RendererFactory
  readonly createFallback: RendererFactory
  readonly createReplacementSceneCanvas: () => HTMLCanvasElement
  readonly activateSceneCanvas: (canvas: HTMLCanvasElement) => void
  readonly requestFrame?: (callback: FrameRequestCallback) => number
  readonly cancelFrame?: (handle: number) => void
  readonly onStateChange?: (state: RendererRuntimeState) => void
  readonly onFrame?: (metric: FrameMetric) => void
  readonly frameProbe?: FrameProbe | undefined
}

export class RendererRuntime {
  readonly #options: RendererRuntimeOptions
  readonly #scheduler: FrameScheduler
  readonly #originalStack: CanvasStack
  #active: Renderer | undefined
  #scene: RenderSceneSnapshot | undefined
  #overlay: readonly RenderNode[] = []
  readonly #resources = new Map<
    string,
    {
      readonly input: ImageResourceInput
      active: ImageResource | undefined
      readonly proxy: ImageResource
    }
  >()
  #disposed = false
  #contextLost = false
  #restoreAttempted = false
  #fallbackActivation: Promise<void> | undefined
  #lastError: Error | undefined
  #state: RendererRuntimeState = {
    status: 'initializing',
    backend: 'canvaskit',
  }

  constructor(options: RendererRuntimeOptions) {
    this.#options = options
    this.#originalStack = options.stack
    this.#scheduler = new FrameScheduler({
      requestFrame:
        options.requestFrame ?? ((callback) => requestAnimationFrame(callback)),
      cancelFrame:
        options.cancelFrame ?? ((handle) => cancelAnimationFrame(handle)),
      render: ({ reasons }) => {
        if (!this.#active || !this.#scene) return
        options.frameProbe?.beforeFrame(reasons)
        const metric = this.#active.render(reasons)
        options.frameProbe?.afterFrame(metric)
        options.onFrame?.(metric)
      },
    })
  }

  get state(): RendererRuntimeState {
    return this.#state
  }

  get lastError(): Error | undefined {
    return this.#lastError
  }

  async initialize(): Promise<void> {
    this.#assertActive()
    this.#originalStack.scene.addEventListener(
      'webglcontextlost',
      this.#onContextLost,
    )
    this.#originalStack.scene.addEventListener(
      'webglcontextrestored',
      this.#onContextRestored,
    )
    try {
      const primary = await this.#options.createPrimary()
      await this.#activate(primary, this.#originalStack)
      this.#setState({ status: 'ready', backend: 'canvaskit' })
    } catch (error: unknown) {
      await this.#activateFallback('startupFailure')
      this.#lastError = asError(error)
    }
  }

  async createImageResource(input: ImageResourceInput): Promise<ImageResource> {
    this.#assertActive()
    if (!this.#active) throw new Error('RendererRuntime is not initialized')
    const existing = this.#resources.get(input.id)
    if (existing) existing.proxy.dispose()
    const record: {
      readonly input: ImageResourceInput
      active: ImageResource | undefined
      readonly proxy: ImageResource
    } = {
      input,
      active: await this.#active.createImageResource(input),
      proxy: {
        id: input.id,
        width: input.width,
        height: input.height,
        dispose: () => {
          const current = this.#resources.get(input.id)
          if (current !== record) return
          current.active?.dispose()
          current.active = undefined
          this.#resources.delete(input.id)
        },
      },
    }
    this.#resources.set(input.id, record)
    return record.proxy
  }

  setScene(scene: RenderSceneSnapshot): void {
    this.#assertActive()
    this.#scene = scene
    this.#active?.setScene(scene)
  }

  setOverlay(nodes: readonly RenderNode[]): void {
    this.#assertActive()
    this.#overlay = nodes
    this.#active?.setOverlay(nodes)
  }

  invalidate(reason: InvalidationReason): void {
    this.#assertActive()
    this.#scheduler.invalidate(reason)
  }

  async exportPng(): Promise<Uint8Array> {
    this.#assertActive()
    if (!this.#active) throw new Error('RendererRuntime is not initialized')
    return this.#active.exportPng()
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#scheduler.dispose()
    this.#originalStack.scene.removeEventListener(
      'webglcontextlost',
      this.#onContextLost,
    )
    this.#originalStack.scene.removeEventListener(
      'webglcontextrestored',
      this.#onContextRestored,
    )
    const backend = this.#active?.backend ?? 'canvas2d'
    this.#resources.clear()
    this.#active?.dispose()
    this.#active = undefined
    this.#setState({ status: 'disposed', backend })
  }

  readonly #onContextLost = (event: Event): void => {
    event.preventDefault()
    if (this.#disposed || this.#contextLost) return
    this.#contextLost = true
    this.#restoreAttempted = false
    this.#fallbackActivation = this.#activateFallback('contextLost').catch(
      (error: unknown) => {
        this.#setState({
          status: 'fallback',
          backend: 'canvas2d',
          reason: 'recoveryFailure',
        })
        this.#lastError = asError(error)
      },
    )
  }

  readonly #onContextRestored = (): void => {
    if (this.#disposed || !this.#contextLost || this.#restoreAttempted) return
    this.#restoreAttempted = true
    void this.#restorePrimary()
  }

  async #restorePrimary(): Promise<void> {
    let primary: Renderer | undefined
    try {
      await this.#fallbackActivation
      primary = await this.#options.createPrimary()
      await primary.initialize(this.#originalStack)
      if (this.#scene) primary.setScene(this.#scene)
      primary.setOverlay(this.#overlay)
      for (const resource of this.#resources.values()) {
        resource.active = await primary.createImageResource(resource.input)
      }
      this.#active?.dispose()
      this.#active = primary
      this.#options.activateSceneCanvas(this.#originalStack.scene)
      this.#contextLost = false
      this.#setState({ status: 'ready', backend: 'canvaskit' })
      if (this.#scene) this.#scheduler.invalidate('resource')
    } catch (error: unknown) {
      primary?.dispose()
      this.#setState({
        status: 'fallback',
        backend: 'canvas2d',
        reason: 'recoveryFailure',
      })
      this.#lastError = asError(error)
    }
  }

  async #activateFallback(
    reason: 'startupFailure' | 'contextLost',
  ): Promise<void> {
    const replacement = this.#options.createReplacementSceneCanvas()
    const stack: CanvasStack = { ...this.#originalStack, scene: replacement }
    const fallback = await this.#options.createFallback()
    await this.#activate(fallback, stack)
    this.#options.activateSceneCanvas(replacement)
    this.#setState(
      reason === 'contextLost'
        ? { status: 'recovering', backend: 'canvas2d', reason: 'contextLost' }
        : {
            status: 'fallback',
            backend: 'canvas2d',
            reason: 'startupFailure',
          },
    )
    if (this.#scene) this.#scheduler.invalidate('resource')
  }

  async #activate(renderer: Renderer, stack: CanvasStack): Promise<void> {
    await renderer.initialize(stack)
    if (this.#scene) renderer.setScene(this.#scene)
    renderer.setOverlay(this.#overlay)
    for (const resource of this.#resources.values()) {
      resource.active = await renderer.createImageResource(resource.input)
    }
    this.#active?.dispose()
    this.#active = renderer
  }

  #setState(state: RendererRuntimeState): void {
    this.#state = state
    this.#options.onStateChange?.(state)
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('RendererRuntime is disposed')
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}
