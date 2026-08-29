interface PendingFrame {
  readonly resolve: () => void
  readonly reject: (error: Error) => void
  readonly timeout: number
}

/**
 * Bridges the document-mount lifecycle to CanvasViewport's rendered-frame
 * signal without putting renderer state into Vue reactivity.
 */
export class EditorFirstFrameGate {
  private readonly pending = new Set<PendingFrame>()

  waitForNextFrame(timeoutMs = 8_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const entry: PendingFrame = {
        resolve,
        reject,
        timeout: window.setTimeout(() => {
          this.pending.delete(entry)
          reject(new Error('editor first frame timed out'))
        }, timeoutMs),
      }
      this.pending.add(entry)
    })
  }

  frameReady(): void {
    for (const entry of this.pending) {
      window.clearTimeout(entry.timeout)
      entry.resolve()
    }
    this.pending.clear()
  }

  fail(cause: unknown): void {
    const error =
      cause instanceof Error ? cause : new Error('editor document mount failed')
    for (const entry of this.pending) {
      window.clearTimeout(entry.timeout)
      entry.reject(error)
    }
    this.pending.clear()
  }
}
