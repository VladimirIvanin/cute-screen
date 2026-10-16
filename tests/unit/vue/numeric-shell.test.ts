import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/vue'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { markRaw } from 'vue'
import { createEditorShellPinia } from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  arrowDocument,
  arrowSession,
} from './app-test-kit'
import {
  canvasContext,
  prepareScene,
} from './m08-precision-test-kit'
import { TOOL_SETTINGS_STORAGE_KEY } from '../../../packages/editor-vue/src/shell/workspace/tool-settings-memory'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())

describe('numeric parameters through the mounted editor', () => {
  it('previews and cancels inline font size without leaking defaults, then commits the text once', async () => {
    const session = arrowSession({ ...arrowDocument(), layers: [] })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    await fireEvent.pointerDown(scene, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    await fireEvent.pointerUp(scene, { button: 0, pointerId: 1, clientX: 80, clientY: 50 })
    const editor = await screen.findByRole('textbox', { name: 'Text editor' })
    editor.textContent = 'Hello 😀'
    await fireEvent.input(editor)
    const range = document.createRange()
    range.selectNodeContents(editor)
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
    const before = session.snapshot
    const preferences = localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)
    const size = screen.getByRole('button', { name: 'Font size' })
    await fireEvent.click(size)
    const input = await screen.findByRole('spinbutton', { name: 'Font size value' })
    input.focus()
    await fireEvent.update(input, '37')
    await waitFor(() => expect(size).toHaveTextContent('37'))
    expect(input).toHaveFocus()
    expect(session.snapshot).toEqual(before)
    expect(localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)).toBe(preferences)
    await fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(size).toHaveTextContent('24'))
    expect(session.snapshot).toEqual(before)
    await fireEvent.click(size)
    const precise = await screen.findByRole('spinbutton', { name: 'Font size value' })
    precise.focus()
    await fireEvent.update(precise, '37')
    await waitFor(() => expect(size).toHaveTextContent('37'))
    await fireEvent.keyDown(precise, { key: 'Enter' })
    await fireEvent.keyDown(precise, { key: 'Escape' })
    await waitFor(() => expect(size).toHaveTextContent('37'))
    expect(session.snapshot).toEqual(before)
    await fireEvent.click(size)
    await fireEvent.click(await screen.findByRole('button', { name: '32 px' }))
    await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Font size' }), { key: 'Escape' })
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'text',
      payload: { content: { text: 'Hello 😀', spans: [{ fontSize: 32 }] } },
    })
    session.undo()
    expect(session.snapshot.core.document.layers).toHaveLength(0)
    expect(session.snapshot.core.canUndo).toBe(false)
    view.unmount()
    session.dispose()
  })

  it('previews background palette and numeric changes, then rolls back or applies their shared inline draft', async () => {
    const session = arrowSession({ ...arrowDocument(), layers: [] })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    await fireEvent.pointerDown(scene, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    await fireEvent.pointerUp(scene, { button: 0, pointerId: 1, clientX: 80, clientY: 50 })
    const editor = await screen.findByRole('textbox', { name: 'Text editor' })
    editor.textContent = 'Background'
    await fireEvent.input(editor)
    const before = session.snapshot
    const preferences = localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)
    const toolbar = within(document.querySelector<HTMLElement>('.cs-text-floating-toolbar')!)
    const background = toolbar.getByRole('button', { name: 'Background' })
    await fireEvent.click(background)
    let panel = within(await screen.findByRole('dialog', { name: 'Background' }))
    await fireEvent.click(panel.getByRole('button', { name: 'Blue' }))
    await waitFor(() => expect(editor.style.getPropertyValue('--text-background-color')).toBe('rgba(61, 173, 255, 1)'))
    expect(session.snapshot).toEqual(before)
    expect(localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)).toBe(preferences)
    await fireEvent.click(panel.getByRole('button', { name: 'Custom colour' }))
    await fireEvent.change(panel.getByRole('textbox', { name: 'HEX colour code' }), { target: { value: '#ff7556' } })
    await waitFor(() => expect(editor.style.getPropertyValue('--text-background-color')).toBe('rgba(255, 117, 86, 1)'))
    await fireEvent.update(panel.getByRole('spinbutton', { name: 'Padding' }), '12')
    await fireEvent.update(panel.getByRole('spinbutton', { name: 'Radius' }), '8')
    await waitFor(() => expect(editor.style.getPropertyValue('--text-background-radius')).toBe('8px'))
    expect(editor.style.getPropertyValue('--text-background-padding')).toBe('12px')
    expect(session.snapshot).toEqual(before)
    expect(localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)).toBe(preferences)
    await fireEvent.click(panel.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(editor.style.getPropertyValue('--text-background-color')).toBe('transparent'))
    await fireEvent.click(background)
    panel = within(await screen.findByRole('dialog', { name: 'Background' }))
    expect(panel.getByRole('spinbutton', { name: 'Padding' })).toHaveValue('0')
    await fireEvent.update(panel.getByRole('spinbutton', { name: 'Padding' }), '12')
    await fireEvent.update(panel.getByRole('spinbutton', { name: 'Radius' }), '8')
    await fireEvent.click(panel.getByRole('button', { name: 'Apply' }))
    expect(session.snapshot).toEqual(before)
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'text',
      payload: {
        content: { text: 'Background' },
        background: { padding: 12, radius: 8 },
      },
    })
    session.undo()
    expect(session.snapshot.core.document.layers).toHaveLength(0)
    expect(session.snapshot.core.canUndo).toBe(false)
    view.unmount()
    session.dispose()
  })
})
