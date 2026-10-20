import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { PlatformCapabilities } from '@cute-screen/editor-vue'
import { createPlatformCapabilityMonitor } from '../../../apps/desktop/src/platform-capability-monitor'

function capabilities(available: boolean): PlatformCapabilities {
  return {
    correlationId: 'capability-recovery', session: 'windows',
    capture: { available, backend: 'windowsDxgi', interactiveSelector: available,
      monitorTarget: available, windowTarget: true, activeWindowTarget: available, cursor: false },
    hotkeys: { available: true, backend: 'native', canListShortcuts: false }, cliFallback: false,
  }
}

afterEach(() => vi.useRealTimers())

describe('desktop capture availability', () => {
  it('recovers from a negative startup probe without hiding window capture', async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockResolvedValueOnce(capabilities(false)).mockResolvedValue(capabilities(true))
    const apply = vi.fn(), reportError = vi.fn()
    const monitor = createPlatformCapabilityMonitor({ read, apply, reportError })
    try {
      await monitor.refresh()
      expect(apply).toHaveBeenLastCalledWith(capabilities(false))
      await vi.advanceTimersByTimeAsync(1000)
      expect(apply).toHaveBeenLastCalledWith(capabilities(true))
      await vi.advanceTimersByTimeAsync(10000)
      expect(read).toHaveBeenCalledTimes(2)
      expect(reportError).not.toHaveBeenCalled()
    } finally {
      monitor.dispose()
    }
  })

  it('bounds retries, reports errors and allows a new probe on focus', async () => {
    vi.useFakeTimers()
    const failure = new Error('IPC unavailable')
    const read = vi.fn().mockRejectedValue(failure), apply = vi.fn(), reportError = vi.fn()
    const monitor = createPlatformCapabilityMonitor({ read, apply, reportError })
    try {
      await monitor.refresh()
      await vi.advanceTimersByTimeAsync(10000)
      expect(read).toHaveBeenCalledTimes(3)
      expect(reportError).toHaveBeenCalledWith(failure)
      read.mockResolvedValue(capabilities(true))
      await monitor.refresh()
      expect(apply).toHaveBeenLastCalledWith(capabilities(true))
    } finally {
      monitor.dispose()
    }
  })

  it('coalesces requests and ignores a late reply after disposal', async () => {
    vi.useFakeTimers()
    let resolve: ((value: PlatformCapabilities) => void) | undefined
    const read = vi.fn(() => new Promise<PlatformCapabilities>((done) => {
      resolve = done
    }))
    const apply = vi.fn(), reportError = vi.fn()
    const monitor = createPlatformCapabilityMonitor({ read, apply, reportError })
    const first = monitor.refresh(), second = monitor.refresh()
    expect(read).toHaveBeenCalledTimes(1)
    monitor.dispose()
    resolve!(capabilities(false))
    await Promise.all([first, second])
    await vi.advanceTimersByTimeAsync(10000)
    expect(apply).not.toHaveBeenCalled()
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('cancels a scheduled retry when its window unmounts', async () => {
    vi.useFakeTimers()
    const read = vi.fn().mockResolvedValue(capabilities(false))
    const monitor = createPlatformCapabilityMonitor({ read, apply: vi.fn(), reportError: vi.fn() })
    await monitor.refresh()
    monitor.dispose()
    await vi.advanceTimersByTimeAsync(10000)
    expect(read).toHaveBeenCalledTimes(1)
  })
})
