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
 * is acquired. Keeping this await in the UI-to-native boundary prevents GTK
 * from processing the queued unmap after native capture has already started.
 */
export async function dispatchNativeCapture<T>({
  session,
  mainWindow,
  waitForMainWindowUnmap,
  capture,
}: NativeCaptureDispatchOptions<T>): Promise<T> {
  if (session !== 'x11') return capture()

  try {
    await mainWindow.hide()
    await waitForMainWindowUnmap()
  } catch (error) {
    return await restoreMainWindow(mainWindow, error)
  }

  try {
    return await capture()
  } catch (error) {
    return await restoreMainWindow(mainWindow, error)
  }
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
