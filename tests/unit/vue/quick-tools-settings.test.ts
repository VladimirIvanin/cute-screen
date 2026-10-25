import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/vue'
import {
  computed,
  markRaw,
  nextTick,
  ref,
} from 'vue'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorShellPinia,
  parsePreferences,
  quickToolCatalog,
  UI_PREFERENCES_STORAGE_KEY,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import SettingsApp from '../../../apps/desktop/src/SettingsApp.vue'
import QuickToolsSettings from '../../../apps/desktop/src/settings/QuickToolsSettings.vue'
import { createSettingsHarnessBridge } from '../../../apps/desktop/src/settings/browser-harness'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import { createToolCatalog } from '../../../packages/editor-vue/src/shell/tools/catalog'
import { arrowSession } from './app-test-kit'

beforeEach(() => window.localStorage.clear())

describe('quick toolbar configuration', () => {
  it('opens from Settings, pins V and transfers tools in both directions with persistence', async () => {
    const pinia = createEditorShellPinia()
    const view = render(SettingsApp, { props: { bridge: createSettingsHarnessBridge() }, global: { plugins: [pinia] } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Quick mode' }))
    await screen.findByRole('heading', { name: 'Quick mode' })
    expect(screen.getByRole('button', { name: 'Select: Always on the toolbar' })).toBeDisabled()
    for (const id of ['hand', 'crop', 'gradient']) expect(view.container.querySelector(`[data-quick-tool="${id}"]`)).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Arrow: Hide' }))
    const hiddenGroup = within(screen.getByRole('group', { name: 'Hidden tools' }))
    expect(hiddenGroup.getByRole('button', { name: 'Arrow: Show on toolbar' })).toBeInTheDocument()
    expect(parsePreferences(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY), ['en']).quickHiddenTools).toEqual(['arrow'])
    view.unmount()
    render(SettingsApp, {
      props: { bridge: createSettingsHarnessBridge() },
      global: { plugins: [createEditorShellPinia()] },
    })
    await fireEvent.click(await screen.findByRole('button', { name: 'Quick mode' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Arrow: Show on toolbar' }))
    expect(screen.getByText('Every tool is on the toolbar. Drag tools here to hide them.')).toBeInTheDocument()
  })

  it('moves by drag/drop, cancels without saving, ignores unrelated releases and reports storage errors', async () => {
    const view = render(QuickToolsSettings, { props: { locale: 'en' }, global: { plugins: [createEditorShellPinia()] } })
    const arrow = screen.getByRole('button', { name: 'Arrow: Hide' })
    const point = vi.fn(() => screen.getByRole('group', { name: 'Hidden tools' }))
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: point })
    const pointer = { button: 0, pointerId: 1, clientX: 10, clientY: 10 }
    await fireEvent.pointerDown(arrow, pointer)
    await fireEvent.pointerMove(window, { ...pointer, clientY: 100 })
    await fireEvent.keyDown(arrow, { key: 'Escape' })
    await fireEvent.pointerUp(window, pointer)
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBeNull()
    await fireEvent.pointerUp(window, pointer)
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBeNull()
    await fireEvent.pointerDown(arrow, pointer)
    await fireEvent.pointerMove(window, { ...pointer, clientY: 100 })
    await fireEvent.pointerUp(window, { ...pointer, clientY: 100 })
    expect(screen.getByRole('button', { name: 'Arrow: Show on toolbar' })).toHaveFocus()
    const save = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('disk full')
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Arrow: Show on toolbar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('disk full')
    save.mockRestore()
    await fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    expect(screen.queryByRole('alert')).toBeNull()
    view.unmount()
  })

  it('validates old and damaged preferences, preserves hidden future IDs, and keeps new tools enabled', () => {
    const base = { schemaVersion: 1, locale: 'en', theme: 'system' }
    expect(parsePreferences(JSON.stringify(base), ['en'])).toEqual(base)
    const preferences = parsePreferences(JSON.stringify({
      ...base, quickHiddenTools: ['select', 'crop', 'hand', 4, 'arrow', 'arrow', 'futureTool'],
    }), ['en'])
    expect(preferences.quickHiddenTools).toEqual(['arrow', 'futureTool'])
    expect(parsePreferences(JSON.stringify({ ...base, quickHiddenTools: 'arrow' }), ['en'])).toEqual(base)
    const context = {
      quickMode: true, quickHiddenTools: ref(preferences.quickHiddenTools), readOnlyDocument: ref(false),
      contentImageBridgeAvailable: ref(true),
      contentImageImporting: ref(false),
      hasInteractiveDocument: computed(() => true),
      hasCanvas: computed(() => true),
    }
    const quick = createToolCatalog(context)
    const expected = quickToolCatalog.filter((tool) => tool.id !== 'arrow').map((tool) => tool.id)
    expect(quick.tools.value.map((tool) => tool.id)).toEqual(expected)
    expect(createToolCatalog({ ...context, quickMode: false }).tools.value.map((tool) => tool.id)).toContain('arrow')
  })

  it('applies saved configuration on real Quick mount and leaves all Editor tools available', async () => {
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify({
      schemaVersion: 1, locale: 'en', theme: 'system', quickHiddenTools: ['arrow', 'select'],
      quickToolOrder: ['loupe', 'line', 'select'],
    }))
    for (const quickMode of [true, false]) {
      const session = arrowSession()
      const pinia = createEditorShellPinia()
      const view = render(EditorShell, {
        props: { quickMode, documentSession: markRaw(session) },
        global: { plugins: [pinia] },
      })
      await nextTick()
      expect(Boolean(view.container.querySelector('[data-tool-id="arrow"]'))).toBe(!quickMode)
      expect(view.container.querySelector('[data-tool-id="select"]')).toBeInTheDocument()
      const railOrder = [...view.container.querySelectorAll<HTMLElement>('[data-tool-id]')].map((tool) => tool.dataset.toolId)
      expect(railOrder.slice(0, 3)).toEqual(quickMode ? ['select', 'loupe', 'line'] : ['select', 'hand', 'crop'])
      expect(view.container.querySelectorAll('.cs-tool-group-separator')).toHaveLength(quickMode ? 1 : 2)
      if (quickMode) {
        const store = useEditorShellStore(pinia)
        store.setQuickHiddenTools([])
        await nextTick()
        expect(view.container.querySelector('[data-tool-id="arrow"]')).toBeInTheDocument()
        store.selectTool('arrow')
        store.setQuickHiddenTools(['arrow'])
        await nextTick()
        expect(store.activeToolId).toBe('select')
        store.setQuickHiddenTools(quickToolCatalog.filter((tool) => tool.id !== 'select').map((tool) => tool.id))
        await nextTick()
        expect(view.container.querySelectorAll('[data-tool-id]')).toHaveLength(1)
        expect(view.container.querySelector('.cs-tool-group-separator')).toBeNull()
      }
      view.unmount()
      session.dispose()
    }
  })
})
