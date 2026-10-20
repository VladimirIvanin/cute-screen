import {
  processPixels,
  type PixelJob,
} from './runtime'

export function effectCancelled(): DOMException {
  return new DOMException('Effect preparation cancelled', 'AbortError')
}

/** One worker per renderer. Cancel terminates busy work instead of queuing old frames. */
export class EffectWorker {
  private worker: Worker | undefined
  private cancel: (() => void) | undefined

  async run(
    job: PixelJob,
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw effectCancelled()
    if (typeof Worker === 'undefined') {
      processPixels(job)
      return
    }
    this.cancel?.()
    const worker = this.worker ??= new Worker(new URL('./filter.worker.js', import.meta.url), { type: 'module' })
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        signal?.removeEventListener('abort', abort)
        worker.onmessage = null
        worker.onerror = null
        this.cancel = undefined
      }
      const abort = () => {
        cleanup()
        worker.terminate()
        if (this.worker === worker) this.worker = undefined
        reject(effectCancelled())
      }
      this.cancel = abort
      worker.onmessage = (event: MessageEvent<Uint8ClampedArray>) => {
        cleanup()
        job.image.data = event.data
        resolve()
      }
      worker.onerror = (event) => {
        cleanup()
        worker.terminate()
        if (this.worker === worker) this.worker = undefined
        reject(new Error(event.message || 'Effect worker failed'))
      }
      signal?.addEventListener('abort', abort, { once: true })
      worker.postMessage(job, [job.image.data.buffer as ArrayBuffer])
    })
  }

  dispose(): void {
    this.cancel?.()
    this.worker?.terminate()
    this.worker = undefined
  }
}
