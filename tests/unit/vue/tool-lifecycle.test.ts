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
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  arrowSession,
  arrowDocument,
} from './app-test-kit'
import {
  prepareScene,
  canvasContext,
} from './m08-precision-test-kit'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())
function mount(quickMode = false) {
  const session = arrowSession({ ...arrowDocument(), layers: [] })
  const pinia = createEditorShellPinia()
  const view = render(EditorShell, {
    props: { documentSession: markRaw(session), quickMode },
    global: { plugins: [pinia] },
  })
  const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
  prepareScene(scene)
  return { session, view, scene, store: useEditorShellStore(pinia), close: () => {
    view.unmount()
    session.dispose()
  } }
}
async function draw(
  scene: HTMLCanvasElement,
  label = 'Shape',
) {
  await fireEvent.click(screen.getByRole('button', { name: label }))
  await fireEvent.pointerDown(scene, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
  await fireEvent.pointerMove(scene, { pointerId: 1, button: 0, clientX: 65, clientY: 55 })
  await fireEvent.pointerUp(scene, { pointerId: 1, button: 0, clientX: 65, clientY: 55 })
}
it.each(['canvas', 'background'])('clears real creation selection on an empty %s click without history', async (target) => {
  const app = mount()
  await draw(app.scene)
  expect(app.store.selectedLayerIds).toHaveLength(1)
  const execute = vi.spyOn(app.session, 'execute')
  const element = target === 'canvas' ? app.scene : app.view.container.querySelector('.cs-canvas-stage')!
  await fireEvent.pointerDown(element, { pointerId: 2, button: 0, clientX: 95, clientY: 75 })
  expect(app.store.selectedLayerIds).toEqual([])
  expect(app.view.container.querySelector('.cs-selection-floating-toolbar')).toBeNull()
  expect(app.view.container.querySelector('.cs-bottom-chrome-center > .cs-context-toolbar')).toBeNull()
  expect(execute).not.toHaveBeenCalled()
  app.close()
})
it.each(['click', 'keyboard', 'configure'])('clears old selection when activating creation by %s', async (method) => {
  const app = mount()
  await draw(app.scene)
  const pencil = screen.getByRole('button', { name: 'Pencil' })
  if (method === 'click') await fireEvent.click(pencil)
  else if (method === 'configure') await fireEvent.contextMenu(pencil)
  else await fireEvent.keyDown(document.activeElement!, { key: 'p', code: 'KeyP' })
  expect(app.store.activeToolId).toBe('pencil')
  expect(app.store.selectedLayerIds).toEqual([])
  expect(app.view.container.querySelector('.cs-selection-floating-toolbar')).toBeNull()
  app.close()
})
it('closes stale configure on hotkey and same-tool reactivation', async () => {
  const app = mount()
  const arrow = screen.getByRole('button', { name: 'Arrow' })
  await fireEvent.contextMenu(arrow)
  await fireEvent.keyDown(window, { key: 'p', code: 'KeyP' })
  expect(app.store.activeToolId).toBe('pencil')
  expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeNull()
  await fireEvent.contextMenu(arrow)
  await fireEvent.keyDown(window, { key: 'a', code: 'KeyA' })
  expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeNull()
  app.close()
})
it.each([false, true])('shows creation defaults only on configure, quick=%s', async (quick) => {
  const app = mount(quick)
  for (const label of ['Pencil', 'Shape', 'Text', 'Hide data', 'Spotlight', 'Ruler', 'Loupe']) {
    await fireEvent.click(screen.getByRole('button', { name: label }))
    expect(app.view.container.querySelector('.cs-bottom-chrome-center > .cs-context-toolbar, .cs-tool-defaults-toolbar')).toBeNull()
    await fireEvent.contextMenu(screen.getByRole('button', { name: label }))
    expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).not.toBeNull()
  }
  app.close()
})
it('outside dismissal does not return focus to the defaults trigger', async () => {
  const app = mount()
  const arrow = screen.getByRole('button', { name: 'Arrow' })
  await fireEvent.contextMenu(arrow)
  const focus = vi.spyOn(arrow, 'focus')
  await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 1, clientX: 90, clientY: 75 })
  expect(focus).not.toHaveBeenCalled()
  expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeNull()
  app.close()
})
it('keeps selection through zoom and clears it with one consumed Escape', async () => {
  const app = mount()
  await draw(app.scene)
  const ids = [...app.store.selectedLayerIds]
  await fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
  expect(app.store.selectedLayerIds).toEqual(ids)
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
  window.dispatchEvent(event)
  await nextTick()
  expect(app.store.selectedLayerIds).toEqual([])
  expect(event.defaultPrevented).toBe(true)
  app.close()
})
it('keeps teleported controls inside defaults and closes one Escape level at a time', async () => {
  const app = mount()
  const arrow = screen.getByRole('button', { name: 'Arrow' })
  await fireEvent.contextMenu(arrow)
  await fireEvent.click(screen.getByRole('button', { name: 'Stroke: 3 px' }))
  const panel = screen.getByRole('dialog', { name: 'Stroke' })
  await fireEvent.pointerDown(within(panel).getByRole('button', { name: '6 px' }), { button: 0 })
  await fireEvent.click(within(panel).getByRole('button', { name: '6 px' }))
  expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).not.toBeNull()
  await fireEvent.keyDown(panel, { key: 'Escape' })
  expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).not.toBeNull()
  await fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
  expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeNull()
  expect(app.store.activeToolId).toBe('arrow')
  app.close()
})
it('clears a multi-selection but preserves it for modifier clicks and pan', async () => {
  const app = mount()
  await draw(app.scene)
  await draw(app.scene, 'Arrow')
  await fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
  const rows = app.view.container.querySelectorAll<HTMLButtonElement>('.cs-layer-select')
  await fireEvent.keyDown(rows[0]!, { key: 'Enter' })
  await fireEvent.keyDown(rows[1]!, { key: 'Enter', ctrlKey: true })
  expect(app.store.selectedLayerIds).toHaveLength(2)
  const ids = [...app.store.selectedLayerIds]
  await fireEvent.pointerDown(app.scene, { button: 0, ctrlKey: true, pointerId: 1, clientX: 95, clientY: 75 })
  expect(app.store.selectedLayerIds).toEqual(ids)
  await fireEvent.keyDown(window, { key: ' ', code: 'Space' })
  await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 2, clientX: 95, clientY: 75 })
  await fireEvent.pointerUp(app.scene, { button: 0, pointerId: 2, clientX: 95, clientY: 75 })
  await fireEvent.keyUp(window, { key: ' ', code: 'Space' })
  expect(app.store.selectedLayerIds).toEqual(ids)
  await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 3, clientX: 95, clientY: 75 })
  expect(app.store.selectedLayerIds).toEqual([])
  app.close()
})
async function typeText(
  scene: HTMLCanvasElement,
  text = 'Hello',
) {
  await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
  await fireEvent.pointerDown(scene, { button: 0, pointerId: 3, clientX: 5, clientY: 65 })
  await fireEvent.pointerUp(scene, { button: 0, pointerId: 3, clientX: 5, clientY: 65 })
  const editor = screen.getByRole('textbox', { name: 'Text editor' })
  editor.textContent = text
  await fireEvent.input(editor)
  return editor
}
it.each(['canvas', 'background', 'tool', 'layer'])('finishes text before a %s destination without losing the destination', async (destination) => {
  const app = mount()
  await draw(app.scene)
  const shape = app.session.snapshot.core.document.layers[0]!
  await typeText(app.scene)
  if (destination === 'tool') await fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
  else if (destination === 'background') await fireEvent.pointerDown(app.view.container.querySelector('.cs-canvas-stage')!, { button: 0 })
  else await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 4, clientX: destination === 'layer' ? 20 : 95, clientY: destination === 'layer' ? 35 : 5 })
  expect(app.session.snapshot.core.document.layers).toHaveLength(2)
  expect(app.session.snapshot.core.document.layers.at(-1)).toMatchObject({ kind: 'text', payload: { content: { text: 'Hello' } } })
  expect(screen.queryByRole('textbox', { name: 'Text editor' })).toBeNull()
  expect(app.store.activeToolId).toBe(destination === 'tool' ? 'pencil' : 'select')
  expect(app.store.selectedLayerIds).toEqual(destination === 'layer' ? [shape.id] : [])
  app.session.undo()
  expect(app.session.snapshot.core.document.layers).toHaveLength(1)
  app.close()
})
it('defers activation until IME composition commits and keeps the final tool', async () => {
  const app = mount()
  const editor = await typeText(app.scene, '')
  await fireEvent.compositionStart(editor)
  editor.textContent = 'Привет'
  await fireEvent.input(editor)
  await fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
  expect(app.store.activeToolId).toBe('text')
  expect(app.session.snapshot.core.document.layers).toHaveLength(0)
  await fireEvent.compositionEnd(editor)
  expect(app.store.activeToolId).toBe('shape')
  expect(app.store.selectedLayerIds).toEqual([])
  expect(app.session.snapshot.core.document.layers[0]).toMatchObject({ payload: { content: { text: 'Привет' } } })
  app.close()
})
it('cancels new text without history and leaves Crop controls available', async () => {
  const app = mount()
  const editor = await typeText(app.scene)
  await fireEvent.keyDown(editor, { key: 'Escape' })
  expect(app.session.snapshot.core.document.layers).toHaveLength(0)
  expect(app.store.activeToolId).toBe('select')
  expect(app.store.selectedLayerIds).toEqual([])
  await fireEvent.click(screen.getByRole('button', { name: 'Crop' }))
  expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(app.store.activeToolId).toBe('select')
  app.close()
})
it('does not treat another overlay as part of tool defaults', async () => {
  const app = mount()
  await fireEvent.contextMenu(screen.getByRole('button', { name: 'Shape' }))
  const unrelated = document.createElement('button')
  app.view.container.querySelector('.cs-overlay-root')!.append(unrelated)
  await fireEvent.pointerDown(unrelated, { button: 0 })
  expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeNull()
  app.close()
})
it.each(['empty', 'loading', 'readOnly'] as const)('disables canvas actions in %s state', async (state) => {
  const view = render(EditorShell, {
    props: state === 'readOnly' ? { readOnlyDocument: true, initialDocumentState: { kind: 'ready', title: 'Read only', dimensions: '100 × 100' } } : { initialDocumentState: { kind: state } },
    global: { plugins: [createEditorShellPinia()] },
  })
  await fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
  expect(screen.getByRole('menuitem', { name: 'Flip horizontally' })).toBeDisabled()
  expect(screen.getByRole('menuitem', { name: 'Flip vertically' })).toBeDisabled()
  view.unmount()
})
it('keeps the clicked chrome focus when dismissing a selection popover', async () => {
  const app = mount()
  await draw(app.scene, 'Arrow')
  const ids = [...app.store.selectedLayerIds]
  const trigger = screen.getByRole('button', { name: 'Stroke: 3 px' })
  await fireEvent.click(trigger)
  const zoom = screen.getByRole('button', { name: 'Zoom in' })
  zoom.focus()
  await fireEvent.pointerDown(zoom, { button: 0 })
  await fireEvent.click(zoom)
  expect(document.activeElement).toBe(zoom)
  expect(app.store.selectedLayerIds).toEqual(ids)
  app.close()
})
it('drops pending text transitions when switching documents', async () => {
  const app = mount()
  const editor = await typeText(app.scene, '')
  await fireEvent.compositionStart(editor)
  editor.textContent = 'Old document'
  await fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
  const next = arrowSession({ ...arrowDocument(), id: crypto.randomUUID(), layers: [] })
  await app.view.rerender({ documentSession: markRaw(next) })
  expect(screen.queryByRole('textbox', { name: 'Text editor' })).toBeNull()
  expect(next.snapshot.core.document.layers).toHaveLength(0)
  app.close()
})
it('waits for font loading and applies only the last requested tool after one commit', async () => {
  const app = mount()
  await typeText(app.scene)
  const original = Object.getOwnPropertyDescriptor(document, 'fonts')
  let ready = false
  let resolveFonts: (faces: object[]) => void = () => undefined
  const loading = new Promise<object[]>((resolve) => {
    resolveFonts = resolve
  })
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { check: () => ready, load: () => loading },
  })
  try {
    await fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    expect(app.store.activeToolId).toBe('text')
    expect(app.session.snapshot.core.document.layers).toHaveLength(0)
    ready = true
    resolveFonts([{}])
    await vi.waitFor(() => expect(app.store.activeToolId).toBe('pencil'))
    expect(app.session.snapshot.core.document.layers).toHaveLength(1)
    expect(app.store.selectedLayerIds).toEqual([])
    app.session.undo()
    expect(app.session.snapshot.core.document.layers).toHaveLength(0)
  } finally {
    if (original) Object.defineProperty(document, 'fonts', original)
    else Reflect.deleteProperty(document, 'fonts')
    app.close()
  }
})
it('restores the selected existing text when cancelling edits started with the Text tool', async () => {
  const app = mount()
  const first = await typeText(app.scene)
  await fireEvent.keyDown(first, { key: 'Enter', ctrlKey: true })
  const before = app.session.snapshot.core.document.layers[0]!
  await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
  expect(app.store.selectedLayerIds).toEqual([])
  await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 6, clientX: 10, clientY: 70 })
  const editor = screen.getByRole('textbox', { name: 'Text editor' })
  editor.textContent = 'Discarded'
  await fireEvent.input(editor)
  await fireEvent.keyDown(editor, { key: 'Escape' })
  expect(app.session.snapshot.core.document.layers[0]).toEqual(before)
  expect(app.store.selectedLayerIds).toEqual([before.id])
  expect(app.store.activeToolId).toBe('select')
  app.close()
})
