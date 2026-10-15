import type { HighlighterEffect } from '@cute-screen/editor-renderer'
import { imageAnalysisSource } from '../../image-transport'

export interface HighlighterAnalysis {
  readonly status: 'loading' | 'ready' | 'unavailable'
  readonly effect: HighlighterEffect
}

interface AnalysisRuntime {
  supported(): boolean
  source(image: HTMLImageElement): Blob | string | undefined
  worker(): Worker
}

const runtime: AnalysisRuntime = {
  supported: () => typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap === 'function',
  source: imageAnalysisSource,
  worker: () => new Worker(new URL('./highlighter-background.worker.ts', import.meta.url), { type: 'module' }),
}

/** One job per source load, launched by frameReady, never from the pointer/render loop. */
export class HighlighterBackgroundController {
  private revision = 0
  private started = false
  private worker: Worker | undefined
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly update: (value: HighlighterAnalysis) => void,
    private readonly ports = runtime,
  ) {}

  reset(): void {
    this.revision += 1
    this.started = false
    this.cleanup()
    this.update({ status: 'loading', effect: 'highlight' })
  }

  dispose(): void {
    this.revision += 1
    this.started = true
    this.cleanup()
  }

  private cleanup(): void {
    this.worker?.terminate()
    this.worker = undefined
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }

  start(image: HTMLImageElement | undefined): void {
    if (this.started) return
    this.started = true
    const revision = this.revision
    // Yield past frameReady so capture handoff and the first visible paint do not wait for analysis.
    this.timer = setTimeout(() => {
      void this.analyze(image, revision)
    }, 0)
  }

  private async analyze(
    image: HTMLImageElement | undefined,
    revision: number,
  ): Promise<void> {
    if (revision !== this.revision) return
    if (!image) {
      this.update({ status: 'ready', effect: 'highlight' })
      return
    }
    try {
      if (!this.ports.supported()) throw new Error('Background image analysis is unavailable')
      const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight))
      const width = Math.max(1, Math.round(image.naturalWidth * scale))
      const height = Math.max(1, Math.round(image.naturalHeight * scale))
      const source = this.ports.source(image)
      if (!source) throw new Error('Original image source is unavailable')
      const worker = this.ports.worker()
      this.worker = worker
      const fail = (error: unknown) => {
        if (revision !== this.revision) return
        console.warn('cute-screen highlighter background analysis failed', error)
        this.cleanup()
        this.update({ status: 'unavailable', effect: 'highlight' })
      }
      worker.onmessage = (event: MessageEvent<{ effect?: HighlighterEffect; error?: string }>) => {
        if (revision !== this.revision) return
        const effect = event.data.effect
        if (!['highlight', 'illuminate', 'veil'].includes(effect ?? '')) return fail(event.data.error ?? 'Invalid analysis response')
        this.cleanup()
        this.update({ status: 'ready', effect: effect! })
      }
      worker.onerror = (event) => fail(event.message)
      worker.onmessageerror = () => fail('Unreadable analysis response')
      this.timer = setTimeout(() => fail('Background analysis timed out'), 10_000)
      // Blob uses structured cloning; URLs are immutable local resource references, never pixel JSON.
      worker.postMessage({ source, width, height })
    } catch (error) {
      if (revision === this.revision) {
        console.warn('cute-screen highlighter background analysis unavailable', error)
        this.cleanup()
        this.update({ status: 'unavailable', effect: 'highlight' })
      }
    }
  }
}
