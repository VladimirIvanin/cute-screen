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

  it('hides the macOS editor before the native screen snapshot', async () => {
    const hide = vi.fn().mockResolvedValue(undefined)
    const show = vi.fn().mockResolvedValue(undefined)
    const capture = vi.fn().mockResolvedValue('captured')
    const waitForMainWindowUnmap = vi.fn()

    await expect(
      dispatchNativeCapture({
        session: 'macos',
        mainWindow: { hide, show },
        waitForMainWindowUnmap,
        capture,
      }),
    ).resolves.toBe('captured')

    expect(hide).toHaveBeenCalledOnce()
    expect(waitForMainWindowUnmap).not.toHaveBeenCalled()
    expect(capture).toHaveBeenCalledOnce()
    expect(show).toHaveBeenCalledOnce()
    expect(hide.mock.invocationCallOrder[0]).toBeLessThan(
      capture.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
    expect(capture.mock.invocationCallOrder[0]).toBeLessThan(
      show.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('restores the X11 editor after a successful capture', async () => {
    const hide = vi.fn().mockResolvedValue(undefined)
    const show = vi.fn().mockResolvedValue(undefined)
    const capture = vi.fn().mockResolvedValue('captured')

    await expect(
      dispatchNativeCapture({
        session: 'x11',
        mainWindow: { hide, show },
        waitForMainWindowUnmap: vi.fn().mockResolvedValue(undefined),
        capture,
      }),
    ).resolves.toBe('captured')

    expect(show).toHaveBeenCalledOnce()
    expect(capture.mock.invocationCallOrder[0]).toBeLessThan(
      show.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    )
  })

  it('restores the macOS editor if native dispatch rejects after hide', async () => {
    const failure = new Error('capture IPC rejected')
    const show = vi.fn().mockResolvedValue(undefined)

    await expect(
      dispatchNativeCapture({
        session: 'macos',
        mainWindow: { hide: vi.fn().mockResolvedValue(undefined), show },
        waitForMainWindowUnmap: vi.fn(),
        capture: vi.fn().mockRejectedValue(failure),
      }),
    ).rejects.toBe(failure)

    expect(show).toHaveBeenCalledOnce()
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
