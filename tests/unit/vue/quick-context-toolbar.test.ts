import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/vue'
import {
  markRaw,
  nextTick,
} from 'vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import { rememberQuickSettingsCollapsed } from '../../../packages/editor-vue/src/shell/workspace/quick-settings-memory'
import { arrowSession } from './app-test-kit'

function renderDocument(quickMode: boolean) {
  window.localStorage.clear()
  const session = arrowSession()
  const pinia = createEditorShellPinia()
  const view = render(EditorShell, {
    props: { quickMode, documentSession: markRaw(session) },
    global: { plugins: [pinia] },
  })
  return { session, view, store: useEditorShellStore(pinia) }
}

describe('Quick Capture context toolbar', () => {
  it('omits canvas actions and empty panels across tools and selection changes', async () => {
    rememberQuickSettingsCollapsed(false)
    const { view, session, store } = renderDocument(true)
    for (const tool of ['Select', 'Arrow', 'Select']) {
      await fireEvent.click(screen.getByRole('button', { name: tool }))
      expect(screen.queryByRole('button', { name: 'Flip horizontally' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Flip vertically' })).toBeNull()
      if (tool === 'Arrow') {
        expect(view.container.querySelector('.cs-tool-defaults-toolbar')).toHaveAttribute('aria-hidden', 'false')
        expect(screen.queryByRole('button', { name: 'Tool settings' })).toBeNull()
      } else expect(view.container.querySelector('.cs-context-toolbar')).toBeNull()
    }
    store.selectLayer(session.snapshot.core.document.layers[0]!.id)
    await nextTick()
    expect(view.container.querySelector('.cs-selection-floating-toolbar')).toBeInTheDocument()
    expect(view.container.querySelector('.cs-quick-toolrail-group + .cs-context-toolbar')).toBeNull()
    store.clearLayerSelection()
    await nextTick()
    expect(view.container.querySelector('.cs-context-toolbar')).toBeNull()
    view.unmount()
    session.dispose()
  })

  it('reports quick defaults layout before the next paint task', async () => {
    rememberQuickSettingsCollapsed(false)
    const seen: boolean[] = []
    const onPreview = () => {
      seen.push(Boolean(document.querySelector('.cs-quick-defaults')))
    }
    document.addEventListener('cs-preview-layout', onPreview)
    const { view, session } = renderDocument(true)
    try {
      await fireEvent.click(screen.getByRole('button', { name: 'Arrow' }))
      expect(seen).toContain(true)
      expect(view.container.querySelector('.cs-quick-toolrail-group')).toBeTruthy()
    } finally {
      document.removeEventListener('cs-preview-layout', onPreview)
      view.unmount()
      session.dispose()
    }
  })

  it('does not hide quick settings while switching between tools', async () => {
    const { view, session, store } = renderDocument(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    const panel = view.container.querySelector<HTMLElement>('.cs-quick-defaults')!
    panel.dispatchEvent(new CustomEvent('cs-quick-settings-layout', { detail: false }))
    await nextTick()
    expect(panel).not.toHaveClass('is-collapsed')
    const hidden = vi.fn()
    const observer = new MutationObserver(() => {
      if (panel.classList.contains('is-collapsed') || panel.getAttribute('aria-hidden') === 'true') hidden()
    })
    observer.observe(panel, { attributes: true, attributeFilter: ['class', 'aria-hidden'] })
    try {
      store.selectTool('arrow')
      await nextTick()
      panel.dispatchEvent(new CustomEvent('cs-quick-settings-layout', { detail: false }))
      await nextTick()
      expect(hidden).not.toHaveBeenCalled()
      expect(panel).not.toHaveClass('is-collapsed')
      expect(panel).toHaveAttribute('aria-hidden', 'false')
    } finally {
      observer.disconnect()
      view.unmount()
      session.dispose()
    }
  })

  it('retains tool settings and selected-arrow formatting without fallback actions', async () => {
    const { view, session, store } = renderDocument(true)
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Pencil' }))
    expect(view.container.querySelector('.cs-context-toolbar')).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    store.selectLayer(session.snapshot.core.document.layers[0]!.id)
    await nextTick()
    expect(view.container.querySelector('.cs-arrow-floating-toolbar-host')).toBeInTheDocument()
    expect(
      view.container.querySelector('.cs-arrow-floating-toolbar-host button[aria-label^="Head:"]'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Flip horizontally' })).toBeNull()
    store.clearLayerSelection()
    await nextTick()
    expect(view.container.querySelector('.cs-context-toolbar')).toBeNull()
    view.unmount()
    session.dispose()
  })

  it.each(['horizontally', 'vertically'])('keeps full-editor flip %s undoable', async (axis) => {
    const { view, session } = renderDocument(false)
    await fireEvent.click(screen.getByRole('button', { name: 'Select' }))
    const before = session.snapshot.core.document
    await fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await fireEvent.click(screen.getByRole('button', { name: `Flip ${axis}` }))
    const flipped = session.snapshot.core.document
    expect(flipped.layers).not.toEqual(before.layers)
    await fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(session.snapshot.core.document.layers).toEqual(before.layers)
    await fireEvent.click(screen.getByRole('button', { name: 'Redo' }))
    expect(session.snapshot.core.document.layers).toEqual(flipped.layers)
    const rail = screen.getByRole('complementary', { name: 'Tools' })
    for (const [label, icon] of [
      ['Select', 'pointer-2'],
      ['Text', 'typography'],
      ['Numbered marker', 'circle-number-1'],
    ] as const) {
      expect(within(rail).getByRole('button', { name: label }).querySelector(`svg.tabler-icon-${icon}`)).toBeTruthy()
    }
    expect(within(rail).getByRole('button', { name: 'Callout' }).querySelector('svg.cs-icon-callout')).toBeTruthy()
    view.unmount()
    session.dispose()
  })
})
