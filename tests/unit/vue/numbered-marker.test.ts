import {
  beforeEach,
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  render,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/vue'
import {
  markRaw,
  nextTick,
} from 'vue'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import { createNumberedMarkerLayer } from '@cute-screen/editor-renderer'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  arrowDocument,
  arrowSession,
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
async function mount(readOnlyDocument = false) {
  const session = arrowSession({ ...arrowDocument(), layers: [] })
  const pinia = createEditorShellPinia()
  const view = render(EditorShell, {
    props: { documentSession: markRaw(session), readOnlyDocument },
    global: { plugins: [pinia] },
  })
  const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
  prepareScene(scene)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Numbered marker' })).toBeEnabled())
  return { session, view, scene, store: useEditorShellStore(pinia), close: () => {
    view.unmount()
    session.dispose()
  } }
}
async function place(
  scene: HTMLCanvasElement,
  x = 30,
) {
  await fireEvent.pointerDown(scene, { button: 0, pointerId: 1, clientX: x, clientY: 30 })
  await fireEvent.pointerUp(scene, { button: 0, pointerId: 1, clientX: x, clientY: 30 })
}
async function configure() {
  await fireEvent.contextMenu(screen.getByRole('button', { name: 'Numbered marker' }))
  return screen.findByRole('spinbutton', { name: 'Next number' })
}
const layers = (app: Awaited<ReturnType<typeof mount>>) => app.session.snapshot.core.document.layers

describe('numbered marker mounted UX', () => {
  it('previews a repeated number gesture and commits it as one undo step', async () => {
    const app = await mount()
    try {
      await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
      await place(app.scene)
      const before = layers(app)[0]!
      app.store.selectTool('select')
      app.store.selectLayer(before.id)
      await nextTick()
      const input = await screen.findByRole('spinbutton', { name: 'Number' })
      const execute = vi.spyOn(app.session, 'execute')
      await fireEvent.keyDown(input, { key: 'ArrowUp' })
      await fireEvent.keyDown(input, { key: 'ArrowUp', repeat: true, shiftKey: true })
      expect(input).toHaveValue('12')
      expect(layers(app)[0]).toEqual(before)
      expect(execute).not.toHaveBeenCalled()
      await fireEvent.keyUp(input, { key: 'ArrowUp' })
      expect(execute).toHaveBeenCalledOnce()
      expect(layers(app)[0]).toMatchObject({ payload: { sequence: 12 } })
      app.session.undo()
      expect(layers(app)[0]).toEqual(before)
      app.session.redo()
      expect(layers(app)[0]).toMatchObject({ payload: { sequence: 12 } })
    } finally {
      app.close()
    }
  })
  it('keeps a manual next number across tools, consumes it only on placement and returns to max+1', async () => {
    const app = await mount()
    const next = await configure()
    await fireEvent.update(next, '10')
    await fireEvent.keyDown(next, { key: 'Enter' })
    await fireEvent.click(screen.getByRole('button', { name: 'Pencil' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    await place(app.scene)
    expect(layers(app).at(-1)).toMatchObject({ payload: { sequence: 10, label: { text: '10' } } })
    expect(app.store.activeToolId).toBe('numberedMarker')
    expect(app.store.selectedLayerIds).toHaveLength(0)
    await place(app.scene, 75)
    expect(layers(app).at(-1)).toMatchObject({ payload: { sequence: 11 } })
    app.session.undo()
    app.session.redo()
    expect(layers(app).at(-1)).toMatchObject({ payload: { sequence: 11 } })
    app.close()
  })
  it('does not spend the next number or add history when a placement is cancelled', async () => {
    const app = await mount()
    const input = await configure()
    await fireEvent.update(input, '20')
    await fireEvent.keyDown(input, { key: 'Enter' })
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 1, clientX: 30, clientY: 30 })
    await fireEvent.pointerCancel(app.scene, { pointerId: 1 })
    expect(layers(app)).toHaveLength(0)
    await place(app.scene)
    expect(layers(app)[0]).toMatchObject({ payload: { sequence: 20 } })
    app.close()
  })
  it('validates numbers and allows a duplicate with a warning', async () => {
    const app = await mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    await place(app.scene)
    const input = await configure()
    await fireEvent.update(input, '-1')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await fireEvent.update(input, '1')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(await screen.findByText('This number is already used')).toBeInTheDocument()
    expect(layers(app)).toHaveLength(1)
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    await place(app.scene, 75)
    expect(layers(app).map((layer) => layer.kind === 'numberedMarker' ? layer.payload.sequence : 0)).toEqual([1, 1])
    app.close()
  })
  it('shows dedicated controls, changes shape/font/colours and edits a selected number in one command', async () => {
    const app = await mount()
    await configure()
    expect(screen.queryByRole('button', { name: 'Bullet list' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Strikethrough' })).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Diamond' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Font size' }))
    await fireEvent.click(await screen.findByRole('button', { name: '32 px' }))
    await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Font size' }), { key: 'Escape' })
    await fireEvent.click(screen.getByRole('button', { name: 'Badge color' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Red' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Label color' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'White' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    await place(app.scene)
    const before = layers(app)[0]!
    expect(before).toMatchObject({ kind: 'numberedMarker', payload: { badge: { shape: 'diamond', color: { red: 1 } }, label: { spans: [{ fontSize: 32, color: { red: 1, green: 1, blue: 1 } }] } } })
    expect(before.localBounds.width).toBeGreaterThan(32)
    app.store.selectTool('select')
    app.store.selectLayer(before.id)
    await nextTick()
    const input = await screen.findByRole('spinbutton', { name: 'Number' })
    const execute = vi.spyOn(app.session, 'execute')
    await fireEvent.update(input, '100')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(layers(app)[0]).toMatchObject({ payload: { sequence: 100, label: { text: '100' } } })
    app.session.undo()
    expect(layers(app)[0]).toEqual(before)
    app.close()
  })
  it('edits a separate multiline caption without changing its badge and removes only the caption', async () => {
    const app = await mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    await place(app.scene)
    const first = layers(app)[0]!
    app.store.selectTool('select')
    app.store.selectLayer(first.id)
    await nextTick()
    await fireEvent.click(await screen.findByRole('button', { name: 'Add label' }))
    const editor = await screen.findByRole('textbox', { name: 'Numbered marker editor' })
    editor.textContent = 'Шаг\nдалее'
    await fireEvent.input(editor)
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(layers(app)[0]).toMatchObject({ payload: { sequence: 1, label: { text: '1\nШаг\nдалее' } } }))
    expect(layers(app)[0]!.localBounds).toEqual(first.localBounds)
    expect(await screen.findByRole('spinbutton', { name: 'Number' })).toHaveValue('1')
    const number = screen.getByRole('spinbutton', { name: 'Number' })
    await fireEvent.update(number, '100')
    await fireEvent.keyDown(number, { key: 'Enter' })
    expect(layers(app)[0]).toMatchObject({ payload: { sequence: 100, label: { text: '100\nШаг\nдалее' } } })
    app.session.undo()
    await nextTick()
    expect(layers(app)[0]).toMatchObject({ payload: { sequence: 1, label: { text: '1\nШаг\nдалее' } } })
    await fireEvent.click(await screen.findByRole('button', { name: 'Edit label' }))
    const emptyEditor = await screen.findByRole('textbox', { name: 'Numbered marker editor' })
    emptyEditor.textContent = ''
    await fireEvent.input(emptyEditor)
    await fireEvent.keyDown(emptyEditor, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(layers(app)[0]).toMatchObject({ kind: 'numberedMarker', payload: { sequence: 1, label: { text: '1' } } }))
    app.session.undo()
    await nextTick()
    await fireEvent.click(await screen.findByRole('button', { name: 'Remove label' }))
    expect(layers(app)[0]).toMatchObject({ payload: { sequence: 1, label: { text: '1' } } })
    app.close()
  })
  it('resets the manual number on document replacement and blocks read-only editing', async () => {
    const app = await mount()
    const input = await configure()
    await fireEvent.update(input, '25')
    await fireEvent.keyDown(input, { key: 'Enter' })
    const replacement = arrowSession({ ...arrowDocument(), id: '019c1f62-058e-7000-8000-0000000000ab', layers: [] })
    await app.view.rerender({ documentSession: markRaw(replacement) })
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    await configure()
    expect(screen.getByRole('spinbutton', { name: 'Next number' })).toHaveValue('1')
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    await place(app.scene)
    const layer = replacement.snapshot.core.document.layers[0]!
    app.store.selectTool('select')
    app.store.selectLayer(layer.id)
    await nextTick()
    await app.view.rerender({ readOnlyDocument: true })
    expect(screen.getByRole('spinbutton', { name: 'Number' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add label' })).toBeDisabled()
    app.close()
    replacement.dispose()
  })
  it('shows mixed shape/colour for a marker group and blocks locked selections', async () => {
    const app = await mount()
    const first = createNumberedMarkerLayer({ id: '019c1f62-058e-7000-8000-000000000091', sequence: 1, origin: { x: 10, y: 10 } })
    const second = createNumberedMarkerLayer({ id: '019c1f62-058e-7000-8000-000000000092', sequence: 2, origin: { x: 80, y: 80 }, shape: 'square' })
    app.session.execute({ type: 'addLayer', layer: first })
    app.session.execute({ type: 'addLayer', layer: second })
    await nextTick()
    app.store.selectTool('select')
    app.store.selectLayer(first.id)
    app.store.selectLayer(second.id, true)
    await nextTick()
    expect(app.store.selectedLayerIds).toEqual([first.id, second.id])
    expect(screen.queryByRole('spinbutton', { name: 'Number' })).toBeNull()
    expect(await screen.findByRole('button', { name: 'Circle' })).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(screen.getByRole('button', { name: 'Star' }))
    expect(layers(app).every((layer) => layer.kind === 'numberedMarker' && layer.payload.badge.shape === 'star')).toBe(true)
    app.session.undo()
    app.session.execute({ type: 'updateLayer', before: first, after: { ...first, locked: true } })
    await nextTick()
    expect(screen.getByRole('button', { name: 'Star' })).toBeDisabled()
    app.close()
  })
})
