import { describe, expect, it, vi } from 'vitest'

import { EditorFirstFrameGate } from '../../../apps/desktop/src/editor-first-frame'

describe('quick capture editor first-frame readiness', () => {
  it('does not acknowledge a mounted document before its rendered frame', async () => {
    const gate = new EditorFirstFrameGate()
    const ready = gate.waitForNextFrame(100)
    const acknowledgement = vi.fn()
    void ready.then(acknowledgement)

    await Promise.resolve()
    expect(acknowledgement).not.toHaveBeenCalled()

    gate.frameReady()
    await expect(ready).resolves.toBeUndefined()
    expect(acknowledgement).toHaveBeenCalledOnce()
  })

  it('rejects a missing renderer frame instead of reporting success', async () => {
    vi.useFakeTimers()
    const gate = new EditorFirstFrameGate()
    const ready = gate.waitForNextFrame(100)
    const rejection = expect(ready).rejects.toThrow(
      'editor first frame timed out',
    )

    await vi.advanceTimersByTimeAsync(100)
    await rejection
    vi.useRealTimers()
  })
})
