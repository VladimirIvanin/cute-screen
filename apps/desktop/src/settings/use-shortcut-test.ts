import { ref } from 'vue'
import type { ShortcutAction } from '../generated/desktop-ipc'
import type { ActivationSettingsBridge } from './contracts'

export function useShortcutTest(
  bridge: ActivationSettingsBridge,
  perform: (task: () => Promise<void>) => Promise<void>,
  refresh: () => Promise<void>,
) {
  const testing = ref<ShortcutAction>()
  const testPassed = ref<ShortcutAction>()
  const testExpired = ref(false)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function test(action: ShortcutAction): Promise<void> {
    await perform(async () => {
      await bridge.test(action)
      testPassed.value = undefined
      testing.value = action
      testExpired.value = false
      clearTimeout(timer)
      timer = setTimeout(() => {
        testing.value = undefined
        testExpired.value = true
      }, 30_000)
    })
  }

  function tested(action: ShortcutAction): void {
    clearTimeout(timer)
    testing.value = undefined
    testExpired.value = false
    testPassed.value = action
    void refresh()
  }

  return { testing, testPassed, testExpired, test, tested, dispose: () => clearTimeout(timer) }
}
