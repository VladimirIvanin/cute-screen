import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { createEditorShellPinia } from '@cute-screen/editor-vue'
import SettingsApp from '../../../apps/desktop/src/SettingsApp.vue'
import { createSettingsHarnessBridge } from '../../../apps/desktop/src/settings/browser-harness'
import { UI_PREFERENCES_STORAGE_KEY } from '../../../packages/editor-vue/src/shell/preferences'

function mount() {
  return render(SettingsApp, {
    props: { bridge: createSettingsHarnessBridge() },
    global: { plugins: [createEditorShellPinia()] },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState(null, '', '/?settings=general')
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
