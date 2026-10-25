import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import { UI_PREFERENCES_STORAGE_KEY } from '../../../packages/editor-vue/src/shell/preferences'
import {
  installDesktopUiPreferences,
  uiPreferencesSyncError,
} from '../../../apps/desktop/src/platform/tauri/ui-preferences-adapter'

const native = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  receive: undefined as ((event: { payload: string }) => void) | undefined,
}))
vi.mock('../../../apps/desktop/src/desktop-bridge', () => ({
  tauriDesktopBridge: { settingsGet: native.get, settingsPut: native.put },
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_event, callback) => {
    native.receive = callback
    return () => {
      native.receive = undefined
    }
  }),
}))
const saved = JSON.stringify({ schemaVersion: 1, locale: 'ru', theme: 'dark' })

beforeEach(() => {
  vi.clearAllMocks()
  window.localStorage.clear()
  native.get.mockResolvedValue(null)
  native.put.mockResolvedValue(undefined)
  uiPreferencesSyncError.value = undefined
})

describe('native UI preference synchronization', () => {
  it('repairs a damaged native preference using the same fallback as the WebView', async () => {
    native.get.mockResolvedValue('{')
    const store = useEditorShellStore(createEditorShellPinia())
    const dispose = await installDesktopUiPreferences(store)
    expect(store.locale).toBe('en')
    expect(native.put).toHaveBeenCalledWith(
      UI_PREFERENCES_STORAGE_KEY, 1, JSON.stringify(store.preferences), expect.any(String),
    )
    dispose()
  })

  it('migrates existing editor preferences and applies remote changes without echoing them', async () => {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, saved)
    const store = useEditorShellStore(createEditorShellPinia())
    const dispose = await installDesktopUiPreferences(store)
    expect(store.locale).toBe('ru')
    expect(native.put).toHaveBeenCalledWith(UI_PREFERENCES_STORAGE_KEY, 1, saved, expect.any(String))
    native.put.mockClear()
    native.receive?.({ payload: JSON.stringify({ schemaVersion: 1, locale: 'en', theme: 'light' }) })
    expect(store.locale).toBe('en')
    expect(store.preferences.theme).toBe('light')
    expect(native.put).not.toHaveBeenCalled()
    dispose()
  })

  it('persists Quick visibility and synchronizes remote changes without changing other preferences', async () => {
    native.get.mockResolvedValue(saved)
    const store = useEditorShellStore(createEditorShellPinia())
    const dispose = await installDesktopUiPreferences(store)
    store.setQuickHiddenTools(['arrow', 'select'])
    await vi.waitFor(() => expect(native.put).toHaveBeenCalledWith(
      UI_PREFERENCES_STORAGE_KEY, 1,
      JSON.stringify({ schemaVersion: 1, locale: 'ru', theme: 'dark', quickHiddenTools: ['arrow'] }),
      expect.any(String),
    ))
    native.put.mockClear()
    native.receive?.({ payload: JSON.stringify({ ...store.preferences, quickHiddenTools: ['line'] }) })
    expect(store.preferences.quickHiddenTools).toEqual(['line'])
    expect(store.locale).toBe('ru')
    expect(store.preferences.theme).toBe('dark')
    expect(native.put).not.toHaveBeenCalled()
    dispose()
  })

  it('keeps the latest local choice during queued writes and lets a failed save be retried', async () => {
    native.get.mockResolvedValue(saved)
    const store = useEditorShellStore(createEditorShellPinia())
    const dispose = await installDesktopUiPreferences(store)
    let finish!: () => void
    native.put.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    store.preferences = { ...store.preferences, locale: 'en' }
    await vi.waitFor(() => expect(native.put).toHaveBeenCalledOnce())
    store.preferences = { ...store.preferences, locale: 'ru' }
    native.receive?.({ payload: JSON.stringify({ schemaVersion: 1, locale: 'en', theme: 'dark' }) })
    expect(store.locale).toBe('ru')
    finish()
    await vi.waitFor(() => expect(native.put).toHaveBeenCalledTimes(2))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    native.put.mockRejectedValueOnce(new Error('disk full'))
    store.preferences = { ...store.preferences, locale: 'en' }
    await vi.waitFor(() => expect(uiPreferencesSyncError.value).toBe('disk full'))
    store.preferences = { ...store.preferences }
    await vi.waitFor(() => expect(uiPreferencesSyncError.value).toBeUndefined())
    consoleError.mockRestore()
    dispose()
  })
})
