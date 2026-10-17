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
  const testExpired = ref<ShortcutAction>()
  let timer: ReturnType<typeof setTimeout> | undefined

  async function test(action: ShortcutAction): Promise<void> {
    await perform(async () => {
      await bridge.test(action)
      testPassed.value = undefined
      testing.value = action
      testExpired.value = undefined
      clearTimeout(timer)
      timer = setTimeout(() => {
        testing.value = undefined
        testExpired.value = action
      }, 30_000)
    })
  }

  function tested(action: ShortcutAction): void {
    clearTimeout(timer)
    testing.value = undefined
    testExpired.value = undefined
    testPassed.value = action
    void refresh()
  }

  function resetTest(): void {
    clearTimeout(timer)
    testing.value = undefined
    testPassed.value = undefined
    testExpired.value = undefined
  }

  return { testing, testPassed, testExpired, test, tested, resetTest, dispose: () => clearTimeout(timer) }
}
