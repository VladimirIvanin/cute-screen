import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import { nextTick } from 'vue'
import SettingsApp from '../../../apps/desktop/src/SettingsApp.vue'
import { createSettingsHarnessBridge } from '../../../apps/desktop/src/settings/browser-harness'
import { UI_PREFERENCES_STORAGE_KEY } from '../../../packages/editor-vue/src/shell/preferences'

function mount(pinia = createEditorShellPinia()) {
  return render(SettingsApp, {
    props: { bridge: createSettingsHarnessBridge() },
    global: { plugins: [pinia] },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/?settings=general')
  delete document.documentElement.dataset.theme
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('shared Settings locale', () => {
  it('loads the editor preference, persists changes and keeps the selected theme after remount', async () => {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, locale: 'ru', theme: 'dark' }))
    const view = mount()
    const select = await screen.findByRole('combobox', { name: 'Language / Язык' })
    expect(select).toHaveValue('ru')
    await fireEvent.update(select, 'en')
    expect(JSON.parse(window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)!)).toEqual({ schemaVersion: 1, locale: 'en', theme: 'dark' })
    view.unmount()
    mount()
    expect(await screen.findByRole('combobox', { name: 'Language / Язык' })).toHaveValue('en')
  })
})

describe('shared Settings theme', () => {
  it.each(['dark', 'light'] as const)('applies persisted %s on mount and after reopening', async (theme) => {
    window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, locale: 'ru', theme }))
    const view = mount()
    expect(document.documentElement.dataset.theme).toBe(theme)
    expect(document.documentElement.lang).toBe('ru')
    view.unmount()
    delete document.documentElement.dataset.theme
    mount()
    expect(document.documentElement.dataset.theme).toBe(theme)
  })

  it('reacts to shared preferences while Settings stays open', async () => {
    const pinia = createEditorShellPinia()
    mount(pinia)
    const store = useEditorShellStore(pinia)
    for (const theme of ['dark', 'light', 'dark'] as const) {
      store.preferences = { schemaVersion: 1, locale: 'en', theme }
      await nextTick()
      expect(document.documentElement.dataset.theme).toBe(theme)
    }
  })

  it('follows OS changes only in system mode and removes the listener on close', async () => {
    const media = new EventTarget()
    const remove = vi.spyOn(media, 'removeEventListener')
    vi.spyOn(window, 'matchMedia').mockReturnValue(Object.assign(media, { matches: true }) as MediaQueryList)
    const pinia = createEditorShellPinia()
    const view = mount(pinia)
    const store = useEditorShellStore(pinia)
    expect(document.documentElement.dataset.theme).toBe('dark')
    media.dispatchEvent(Object.assign(new Event('change'), { matches: false }))
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('light')
    store.setTheme('light')
    media.dispatchEvent(Object.assign(new Event('change'), { matches: true }))
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('light')
    store.setTheme('system')
    await nextTick()
    expect(document.documentElement.dataset.theme).toBe('dark')
    view.unmount()
    expect(remove).toHaveBeenCalledWith('change', expect.any(Function))
  })
})
