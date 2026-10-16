import {
  ref,
  shallowRef,
} from 'vue'
import type {
  ShortcutSnapshotV1,
  AutostartSnapshotV1,
} from '../generated/desktop-ipc'
import {
  settingsError,
  type ActivationSettingsBridge,
} from './contracts'

export function useSettingsLoader(bridge: ActivationSettingsBridge) {
  const snapshot = shallowRef<ShortcutSnapshotV1>()
  const startup = shallowRef<AutostartSnapshotV1>()
  const error = ref('')
  const busy = ref(false)
  const loading = ref(true)

  async function load(): Promise<void> {
    loading.value = !snapshot.value
    if (loading.value) error.value = ''
    try {
      const [shortcuts, autostart] = await Promise.all([bridge.snapshot(), bridge.autostart()])
      snapshot.value = shortcuts
      startup.value = autostart
    } catch (cause) {
      error.value = settingsError(cause)
    } finally {
      loading.value = false
    }
  }

  async function perform(task: () => Promise<void>): Promise<void> {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      await task()
    } catch (cause) {
      if (
        typeof cause === 'object' &&
        cause &&
        'code' in cause &&
        cause.code === 'cancelled'
      ) return
      error.value = settingsError(cause)
    } finally {
      busy.value = false
    }
  }

  return { snapshot, startup, error, busy, loading, load, perform }
}
