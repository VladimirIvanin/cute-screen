import type { PlatformCapabilities } from '@cute-screen/editor-vue'

export interface MainWindowCaptureAdapter {
  hide(): Promise<void>
  show(): Promise<void>
}

interface NativeCaptureDispatchOptions<T> {
  readonly session: PlatformCapabilities['session']
  readonly mainWindow: MainWindowCaptureAdapter
  readonly waitForMainWindowUnmap: () => Promise<void>
  readonly capture: () => Promise<T>
}

/**
 * The X11 server must observe the main window's unmap before its frozen frame
 * is acquired. The macOS Rust lifecycle owns hide/restore around its native
 * selector; duplicating that transition here briefly remaps the editor between
 * the selector and quick mode.
 */
export async function dispatchNativeCapture<T>({
  session,
  mainWindow,
  waitForMainWindowUnmap,
  capture,
}: NativeCaptureDispatchOptions<T>): Promise<T> {
  if (session === 'macos') return capture()
  if (session !== 'x11') return capture()
  return runHiddenNativeCapture(
    mainWindow,
    async () => {
      await mainWindow.hide()
      await waitForMainWindowUnmap()
    },
    capture,
  )
}

async function runHiddenNativeCapture<T>(
  mainWindow: MainWindowCaptureAdapter,
  prepare: () => Promise<void>,
  capture: () => Promise<T>,
): Promise<T> {
  try {
    await prepare()
  } catch (error) {
    return await restoreMainWindow(mainWindow, error)
  }

  let result: T
  try {
    result = await capture()
  } catch (error) {
    return await restoreMainWindow(mainWindow, error)
  }

  try {
    await mainWindow.show()
  } catch (restoreError) {
    throw new AggregateError(
      [restoreError],
      'Capture finished but the editor could not be restored',
      { cause: restoreError },
    )
  }
  return result
}

async function restoreMainWindow(
  mainWindow: MainWindowCaptureAdapter,
  originalError: unknown,
): Promise<never> {
  try {
    await mainWindow.show()
  } catch (restoreError) {
    throw new AggregateError(
      [originalError, restoreError],
      'Capture dispatch failed and the editor could not be restored',
      { cause: restoreError },
    )
  }
  throw originalError
}
