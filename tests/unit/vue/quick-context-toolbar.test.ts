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
} from 'vitest'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
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
    const { view, session, store } = renderDocument(true)
    for (const tool of ['Select', 'Arrow', 'Select']) {
      await fireEvent.click(screen.getByRole('button', { name: tool }))
      expect(screen.queryByRole('button', { name: 'Flip horizontally' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Flip vertically' })).toBeNull()
      expect(view.container.querySelector('.cs-context-toolbar')).toBeNull()
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

  it('retains tool settings and selected-arrow formatting without fallback actions', async () => {
    const { view, session, store } = renderDocument(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
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
      ['Callout', 'stroke-dynamic'],
      ['Numbered marker', 'circle-number-1'],
    ] as const) {
      expect(within(rail).getByRole('button', { name: label }).querySelector(`svg.tabler-icon-${icon}`)).toBeTruthy()
    }
    view.unmount()
    session.dispose()
  })
})
