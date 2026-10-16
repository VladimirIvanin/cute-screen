import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import type { ActivationSettingsBridge } from '../../settings/contracts'
import type {
  AutostartSnapshotV1,
  ShortcutAction,
  ShortcutSnapshotV1,
} from '../../generated/desktop-ipc'

export const activationSettingsBridge: ActivationSettingsBridge = {
  snapshot: () => invoke<ShortcutSnapshotV1>('shortcuts_snapshot'),
  assign: (action, trigger) => invoke<ShortcutSnapshotV1>('shortcuts_assign', { action, trigger }),
  probe: (trigger) => invoke<string>('shortcuts_probe', { trigger }),
  recording: (enabled) => invoke<void>('shortcuts_recording', { enabled }),
  cancel: () => invoke<void>('shortcuts_cancel'),
  test: (action) => invoke<void>('shortcuts_test', { action }),
  systemSettings: () => invoke<void>('shortcuts_system_settings'),
  autostart: () => invoke<AutostartSnapshotV1>('autostart_snapshot'),
  setAutostart: (enabled) => invoke<AutostartSnapshotV1>('autostart_set', { enabled }),
  autostartSystemSettings: () => invoke<void>('autostart_system_settings'),
  completeSetup: () => invoke<void>('activation_setup_complete'),
  close: () => getCurrentWindow().close(),
  listen: async (tested, recorded) => {
    const unlistenTested = await listen<ShortcutAction>('cute-screen:shortcut-tested', (event) => tested(event.payload))
    try {
      const unlistenRecorded = await listen<string>('cute-screen:recorded-shortcut', (event) => {
        if (typeof event.payload === 'string') recorded(event.payload)
      })
      return () => {
        unlistenTested()
        unlistenRecorded()
      }
    } catch (error) {
      unlistenTested()
      throw error
    }
  },
}

export async function openActivationSettings(): Promise<void> {
  await invoke<void>('open_activation_settings')
}
