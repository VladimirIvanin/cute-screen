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
 * is acquired. macOS hides the editor before the native snapshot so the host
 * window is not in the Screen Recording frame. Keeping this await in the
 * UI-to-native boundary prevents the shell from racing native capture.
 */
export async function dispatchNativeCapture<T>({
  session,
  mainWindow,
  waitForMainWindowUnmap,
  capture,
}: NativeCaptureDispatchOptions<T>): Promise<T> {
  if (session === 'macos') {
    return runHiddenNativeCapture(mainWindow, () => mainWindow.hide(), capture)
  }
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
