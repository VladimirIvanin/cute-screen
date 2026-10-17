import {
  shallowRef,
  watch,
} from 'vue'
import { listen } from '@tauri-apps/api/event'
export { isTauri as isDesktopRuntime } from '@tauri-apps/api/core'
import {
  parsePreferences,
  UI_PREFERENCES_STORAGE_KEY,
  type useEditorShellStore,
} from '@cute-screen/editor-vue'
import { tauriDesktopBridge } from '../../desktop-bridge'

export const uiPreferencesSyncError = shallowRef<string>()

export function reportUiPreferencesError(error: unknown): void {
  uiPreferencesSyncError.value = error instanceof Error ? error.message : String(error)
  console.error('Could not synchronize desktop UI preferences', error)
}

/** Mirror the browser preference for tray startup and share live changes between WebViews. */
export async function installDesktopUiPreferences(store: ReturnType<typeof useEditorShellStore>): Promise<() => void> {
  const languages = import.meta.env.VITE_TEST_HARNESS === 'true' ? ['en'] : navigator.languages
  let acknowledged = ''
  let pending = 0
  let writes = Promise.resolve()
  const apply = (json: string | null) => {
    const preferences = parsePreferences(json, languages)
    acknowledged = JSON.stringify(preferences)
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, acknowledged)
    store.preferences = preferences
  }
  const unlisten = await listen<string>('cute-screen:ui-preferences', ({ payload }) => {
    if (pending === 0) apply(payload)
  })
  try {
    const saved = await tauriDesktopBridge.settingsGet(UI_PREFERENCES_STORAGE_KEY, crypto.randomUUID())
    apply(saved ?? window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY))
    if (saved !== acknowledged) {
      await tauriDesktopBridge.settingsPut(UI_PREFERENCES_STORAGE_KEY, 1, acknowledged, crypto.randomUUID())
    }
  } catch (error) {
    reportUiPreferencesError(error)
    apply(window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY))
    acknowledged = ''
  }
  const stop = watch(() => store.preferences, (preferences) => {
    const json = JSON.stringify(preferences)
    if (json === acknowledged && pending === 0) return
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, json)
    pending += 1
    writes = writes.then(async () => {
      try {
        await tauriDesktopBridge.settingsPut(UI_PREFERENCES_STORAGE_KEY, 1, json, crypto.randomUUID())
        acknowledged = json
        uiPreferencesSyncError.value = undefined
      } catch (error) {
        reportUiPreferencesError(error)
      } finally {
        pending -= 1
      }
    })
  }, { flush: 'sync' })
  return () => {
    stop()
    unlisten()
  }
}
