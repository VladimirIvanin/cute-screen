export async function listenQuickCaptureAvailable(
  listener: () => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  return listen('cute-screen:quick-capture-available', listener)
}
