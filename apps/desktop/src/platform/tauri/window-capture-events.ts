import type { CaptureOutcomeV2 } from '../../generated/desktop-ipc'

export async function listenWindowCaptureOutcome(
  listener: (outcome: CaptureOutcomeV2) => void,
): Promise<() => void> {
  const { listen } = await import('@tauri-apps/api/event')
  return listen<CaptureOutcomeV2>('cute-screen:window-capture-outcome', ({ payload }) => listener(payload))
}
