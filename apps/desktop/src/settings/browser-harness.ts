import type {
  ShortcutAction,
  ShortcutSnapshotV1,
  AutostartSnapshotV1,
} from '../generated/desktop-ipc'
import type { ActivationSettingsBridge } from './contracts'

/** UI-only browser fixture. Native scenarios always use the real desktop bridge. */
export function createSettingsHarnessBridge(): ActivationSettingsBridge {
  let startup: AutostartSnapshotV1 = { state: 'disabled', message: null }
  let snapshot: ShortcutSnapshotV1 = {
    backend: 'native', platform: 'x11', canPreflight: true, canConfigure: false,
    setupCompleted: false, autostartChoice: null, suggested: ['CTRL+SHIFT+2', 'CTRL+ALT+SHIFT+2'],
    pendingAction: null, error: null,
    entries: (['capture-area', 'capture-screen', 'capture-window', 'capture-active-window', 'capture-repeat', 'show-editor'] as const).map((action) => ({ action, trigger: null, display: null, status: 'unassigned', supported: true, message: null, command: `cute-screen ${action === 'show-editor' ? 'show' : `capture --mode ${action.replace('capture-', '')}`}` })),
  }
  return {
    snapshot: async () => structuredClone(snapshot),
    assign: async (action: ShortcutAction, trigger: string | null) => {
      if (trigger === 'CTRL+SHIFT+3') throw new Error('Combination is used by another application')
      snapshot = { ...snapshot, entries: snapshot.entries.map((entry) => entry.action === action ? { ...entry, trigger, display: trigger, status: trigger ? 'active' : 'unassigned' } : entry) }
      return structuredClone(snapshot)
    },
    probe: async (trigger) => trigger === 'CTRL+SHIFT+3' ? 'occupied' : 'available',
    recording: async () => undefined,
    cancel: async () => undefined,
    test: async () => undefined,
    systemSettings: async () => undefined,
    autostart: async () => startup,
    setAutostart: async (enabled) => {
      startup = { state: enabled ? 'enabled' : 'disabled', message: null }
      snapshot = { ...snapshot, autostartChoice: enabled }
      return startup
    },
    autostartSystemSettings: async () => undefined,
    completeSetup: async () => {
      snapshot = { ...snapshot, setupCompleted: true }
    },
    close: async () => undefined,
    listen: async () => () => undefined,
  }
}
