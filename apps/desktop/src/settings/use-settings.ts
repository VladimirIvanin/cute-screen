import { ref } from 'vue'
import type { ShortcutAction } from '../generated/desktop-ipc'
import { type ActivationSettingsBridge } from './contracts'
import { useSettingsLoader } from './use-settings-loader'
import { useShortcutTest } from './use-shortcut-test'
import { useShortcutRecorder } from './use-shortcut-recorder'

export function useSettings(bridge: ActivationSettingsBridge) {
  const loader = useSettingsLoader(bridge)
  const { snapshot, perform, load, error } = loader
  const recorder = useShortcutRecorder(bridge, snapshot)
  const testState = useShortcutTest(bridge, perform, load)
  const errorAction = ref<ShortcutAction>()
  const pendingTrigger = ref('')
  const verificationExpired = ref<ShortcutAction>()

  async function cancel(): Promise<void> {
    await recorder.cancelRecording()
    testState.resetTest()
    if (recorder.recordError.value) {
      errorAction.value = undefined
      error.value = recorder.recordError.value
      return
    }
    await perform(async () => {
      await bridge.cancel()
      pendingTrigger.value = ''
      await load()
    })
  }

  async function edit(action: ShortcutAction): Promise<void> {
    if (loader.busy.value) return
    errorAction.value = action
    error.value = ''
    await cancel()
    if (error.value) return
    if (snapshot.value?.backend === 'portal' && snapshot.value.canConfigure) {
      await perform(async () => {
        await bridge.systemSettings()
      })
      return
    }
    await recorder.edit(action)
  }

  async function assign(
    action: ShortcutAction,
    value: string | null,
  ): Promise<void> {
    errorAction.value = action
    await perform(async () => {
      await recorder.stopRecording()
      try {
        snapshot.value = await bridge.assign(action, value)
        pendingTrigger.value = snapshot.value.pendingAction === action ? value ?? '' : ''
      } catch (cause) {
        await load()
        throw cause
      }
      await recorder.cancelRecording()
      testState.resetTest()
      verificationExpired.value = undefined
    })
  }

  async function test(action: ShortcutAction): Promise<void> {
    await cancel()
    if (error.value) return
    errorAction.value = action
    await testState.test(action)
  }

  function tested(action: ShortcutAction): void {
    if (verificationExpired.value === action) verificationExpired.value = undefined
    pendingTrigger.value = ''
    testState.tested(action)
  }

  function dispose(): void {
    testState.dispose()
    recorder.disposeRecorder()
  }

  return {
    ...loader, ...recorder, ...testState,
    errorAction, verificationExpired, pendingTrigger, edit, assign, cancel, test, tested, dispose,
  }
}
export type SettingsState = ReturnType<typeof useSettings>
