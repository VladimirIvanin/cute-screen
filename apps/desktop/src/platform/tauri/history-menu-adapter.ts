import { describeError } from '@cute-screen/editor-vue'
import type { ShallowRef } from 'vue'

export async function installHistoryMenuListener(
  openCapture: (id: string) => Promise<boolean>,
  popover: ShallowRef<{ open: () => Promise<void> } | undefined>,
  error: ShallowRef<string | undefined>,
  isDisposed: () => boolean,
  cleanup: Array<() => void>,
): Promise<void> {
  const { listen } = await import('@tauri-apps/api/event')
  const openAll = () => {
    void popover.value?.open()
  }
  const unlisten = await listen<string | null>('cute-screen:open-history', ({ payload }) => {
    if (!payload) {
      openAll()
      return
    }
    void openCapture(payload).then((opened) => {
      if (!opened) openAll()
    }).catch((cause) => {
      error.value = describeError(cause, 'Unable to open capture')
      openAll()
    })
  })
  if (isDisposed()) unlisten()
  else cleanup.push(unlisten)
}
