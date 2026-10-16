import { ref } from 'vue'
import type { ShortcutAction } from '../generated/desktop-ipc'
import {
  settingsError,
  type ActivationSettingsBridge,
} from './contracts'
import { useSettingsLoader } from './use-settings-loader'
import { useShortcutTest } from './use-shortcut-test'

export function useSettings(bridge: ActivationSettingsBridge) {
  const { snapshot, startup, error, busy, loading, load, perform } = useSettingsLoader(bridge)
  const editing = ref<ShortcutAction>()
  const recording = ref(false)
  const trigger = ref('')
  const probe = ref('')
  const testState = useShortcutTest(bridge, perform, load)
  const { testing, testPassed, testExpired, test, tested } = testState

  async function stopRecording(): Promise<void> {
    recording.value = false
    try {
      await bridge.recording(false)
    } catch (cause) {
      error.value = settingsError(cause)
    }
  }

  async function edit(action: ShortcutAction): Promise<void> {
    if (snapshot.value?.backend === 'portal' && snapshot.value.canConfigure) {
      await perform(async () => {
        await bridge.systemSettings()
      })
      return
    }
    await stopRecording()
    editing.value = action
    trigger.value = snapshot.value?.entries.find((entry) => entry.action === action)?.trigger ?? ''
    probe.value = ''
  }

  async function startRecording(): Promise<void> {
    error.value = ''
    try {
      await bridge.recording(true)
      recording.value = true
    } catch (cause) {
      error.value = settingsError(cause)
    }
  }

  async function setTrigger(value: string): Promise<void> {
    trigger.value = value
    await stopRecording()
    probe.value = 'checking'
    try {
      const result = await bridge.probe(value)
      if (trigger.value === value) probe.value = result
    } catch (cause) {
      if (trigger.value === value) {
        probe.value = ''
        error.value = settingsError(cause)
      }
    }
  }

  async function assign(
    action: ShortcutAction,
    value: string | null,
  ): Promise<void> {
    await perform(async () => {
      await stopRecording()
      try {
        snapshot.value = await bridge.assign(action, value)
      } catch (cause) {
        await load()
        throw cause
      }
      editing.value = undefined
      testPassed.value = undefined
    })
  }

  async function cancel(): Promise<void> {
    await stopRecording()
    await perform(async () => {
      await bridge.cancel()
      editing.value = undefined
      await load()
    })
  }

  function dispose(): void {
    testState.dispose()
    void stopRecording()
  }

  return {
    snapshot,
    startup,
    error,
    busy,
    loading,
    editing,
    recording,
    trigger,
    probe,
    testing,
    testPassed,
    testExpired,
    load,
    perform,
    edit,
    startRecording,
    stopRecording,
    setTrigger,
    assign,
    cancel,
    test,
    tested,
    dispose,
  }
}
