import { describe, expect, it, vi } from 'vitest'

import { dispatchNativeCapture } from '../../../apps/desktop/src/capture-request'

describe('native capture dispatch', () => {
  it('awaits hiding the X11 editor before it dispatches capture', async () => {
    let releaseHide: (() => void) | undefined
    const hide = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseHide = resolve
        }),
    )
    const capture = vi.fn().mockResolvedValue('captured')
    const waitForMainWindowUnmap = vi.fn().mockResolvedValue(undefined)

    const pending = dispatchNativeCapture({
      session: 'x11',
      mainWindow: { hide, show: vi.fn() },
      waitForMainWindowUnmap,
      capture,
    })

    expect(hide).toHaveBeenCalledOnce()
    expect(capture).not.toHaveBeenCalled()
    releaseHide?.()

    await expect(pending).resolves.toBe('captured')
    expect(waitForMainWindowUnmap).toHaveBeenCalledOnce()
    expect(capture).toHaveBeenCalledOnce()
    expect(hide.mock.invocationCallOrder[0]).toBeLessThan(
      waitForMainWindowUnmap.mock.invocationCallOrder[0] ??
        Number.POSITIVE_INFINITY,
    )
    expect(waitForMainWindowUnmap.mock.invocationCallOrder[0]).toBeLessThan(
      capture.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('does not hide the main window for a Wayland portal request', async () => {
    const hide = vi.fn()
    const capture = vi.fn().mockResolvedValue('captured')

    await expect(
      dispatchNativeCapture({
        session: 'wayland',
        mainWindow: { hide, show: vi.fn() },
        waitForMainWindowUnmap: vi.fn(),
        capture,
      }),
    ).resolves.toBe('captured')

    expect(hide).not.toHaveBeenCalled()
    expect(capture).toHaveBeenCalledOnce()
  })

  it('restores the X11 editor if native dispatch rejects after preparation', async () => {
    const failure = new Error('capture IPC rejected')
    const show = vi.fn().mockResolvedValue(undefined)

    await expect(
      dispatchNativeCapture({
        session: 'x11',
        mainWindow: { hide: vi.fn().mockResolvedValue(undefined), show },
        waitForMainWindowUnmap: vi.fn().mockResolvedValue(undefined),
        capture: vi.fn().mockRejectedValue(failure),
      }),
    ).rejects.toBe(failure)

    expect(show).toHaveBeenCalledOnce()
  })
})
