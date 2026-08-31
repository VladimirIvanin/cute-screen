import type { ShellActionAdapter } from './types'
import type { UiPreferencesStorage } from './preferences'

export interface ShellStoreOptions {
  readonly preferences: UiPreferencesStorage
  readonly languages: readonly string[]
  readonly systemDark: () => boolean
  readonly actions?: ShellActionAdapter | undefined
}
