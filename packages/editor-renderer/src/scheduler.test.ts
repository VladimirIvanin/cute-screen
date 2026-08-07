import { describe, expect, it, vi } from 'vitest'

import { FrameScheduler } from './scheduler'

describe('FrameScheduler', () => {
  it('coalesces reasons into one frame and stays idle afterwards', () => {
    let callback: FrameRequestCallback | undefined
    const requestFrame = vi.fn((next: FrameRequestCallback) => {
      callback = next
      return 1
    })
    const render = vi.fn()
    const scheduler = new FrameScheduler({
      requestFrame,
      cancelFrame: vi.fn(),
      render,
    })

    scheduler.invalidate('scene')
    scheduler.invalidate('overlay')

    expect(requestFrame).toHaveBeenCalledTimes(1)
    callback?.(12)
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({ reasons: ['scene', 'overlay'] }),
    )
    expect(requestFrame).toHaveBeenCalledTimes(1)
  })

  it('cancels a pending frame when disposed', () => {
    const cancelFrame = vi.fn()
    const scheduler = new FrameScheduler({
      requestFrame: () => 42,
      cancelFrame,
      render: vi.fn(),
    })

    scheduler.invalidate('viewport')
    scheduler.dispose()

    expect(cancelFrame).toHaveBeenCalledWith(42)
    expect(() => scheduler.invalidate('scene')).toThrow(/disposed/u)
  })
})
