export const INVALIDATION_REASONS = [
  'scene',
  'overlay',
  'viewport',
  'resource',
  'export',
] as const

export type InvalidationReason = (typeof INVALIDATION_REASONS)[number]

export interface ScheduledFrame {
  readonly timestamp: number
  readonly reasons: readonly InvalidationReason[]
}

export interface FrameSchedulerOptions {
  readonly requestFrame: (callback: FrameRequestCallback) => number
  readonly cancelFrame: (handle: number) => void
  readonly render: (frame: ScheduledFrame) => void
}

export class FrameScheduler {
  readonly #requestFrame: FrameSchedulerOptions['requestFrame']
  readonly #cancelFrame: FrameSchedulerOptions['cancelFrame']
  readonly #render: FrameSchedulerOptions['render']
  readonly #dirty = new Set<InvalidationReason>()
  #handle: number | undefined
  #disposed = false

  constructor(options: FrameSchedulerOptions) {
    this.#requestFrame = options.requestFrame
    this.#cancelFrame = options.cancelFrame
    this.#render = options.render
  }

  invalidate(reason: InvalidationReason): void {
    if (this.#disposed) throw new Error('FrameScheduler is disposed')
    this.#dirty.add(reason)
    if (this.#handle !== undefined) return
    this.#handle = this.#requestFrame((timestamp) => this.#flush(timestamp))
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#dirty.clear()
    if (this.#handle !== undefined) this.#cancelFrame(this.#handle)
    this.#handle = undefined
  }

  #flush(timestamp: number): void {
    this.#handle = undefined
    if (this.#disposed || this.#dirty.size === 0) return

    const reasons = INVALIDATION_REASONS.filter((reason) =>
      this.#dirty.has(reason),
    )
    this.#dirty.clear()
    this.#render({ timestamp, reasons })

    if (this.#dirty.size > 0 && this.#handle === undefined) {
      this.#handle = this.#requestFrame((nextTimestamp) =>
        this.#flush(nextTimestamp),
      )
    }
  }
}
