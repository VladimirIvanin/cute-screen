import type {
  AutostartSnapshotV1,
  ShortcutAction,
  ShortcutSnapshotV1,
} from '../generated/desktop-ipc'

export interface ActivationSettingsBridge {
  snapshot(): Promise<ShortcutSnapshotV1>
  assign(action: ShortcutAction, trigger: string | null): Promise<ShortcutSnapshotV1>
  probe(trigger: string): Promise<string>
  recording(enabled: boolean): Promise<void>
  cancel(): Promise<void>
  test(action: ShortcutAction): Promise<void>
  systemSettings(): Promise<void>
  autostart(): Promise<AutostartSnapshotV1>
  setAutostart(enabled: boolean): Promise<AutostartSnapshotV1>
  autostartSystemSettings(): Promise<void>
  completeSetup(): Promise<void>
  close(): Promise<void>
  listen(tested: (action: ShortcutAction) => void, recorded: (trigger: string) => void): Promise<() => void>
}

export function settingsError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    error &&
    'message' in error
  ) return String(error.message)
  return String(error)
}
