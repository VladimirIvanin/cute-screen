import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createEditorDocumentFromImage } from '@cute-screen/editor-renderer'
import {
  DocumentSessionController,
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import { markRaw } from 'vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'

function initial() {
  return createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000', baseLayerId: '019c1f62-058e-7000-8000-000000000001',
    timestamp: '2026-10-20T00:00:00Z', source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', provenance: 'fileOpen',
      width: 3840, height: 2160, orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
}
describe('screenshot size and corners', () => {
  it('uses visual canvas radios, preserves dimensions and cancels drafts before switching mode', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) }, correlationId: () => 'canvas-size' })
    const pinia = createEditorShellPinia()
    const store = useEditorShellStore(pinia)
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [pinia] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const controls = within(screen.getByRole('complementary', { name: 'Appearance' }))
      const modes = within(controls.getByRole('radiogroup', { name: 'Canvas size' }))
      expect(modes.getByRole('radio', { name: 'Fit screenshot' })).toBeChecked()
      expect(session.snapshot.core.canUndo).toBe(false)
      expect(store.zoomMode).toBe('custom')
      const execute = vi.spyOn(session, 'execute')
      await fireEvent.click(modes.getByRole('radio', { name: 'Set size' }))
      expect(execute).toHaveBeenCalledTimes(1)
      expect(store.zoomMode).toBe('fit')
      expect(controls.getByText('Output image size in pixels')).toBeVisible()
      const width = controls.getByRole('spinbutton', { name: 'Width' })
      await fireEvent.input(width, { target: { value: '800' } })
      await fireEvent.keyDown(width, { key: 'Enter' })
      await fireEvent.click(within(controls.getByRole('group', { name: 'Canvas aspect ratio' }))
        .getByRole('button', { name: '16:9' }))
      expect(session.snapshot.core.document.presentation.composition?.layout)
        .toMatchObject({ mode: 'fixed', width: 800, height: 450 })
      session.undo()
      await vi.waitFor(() => expect(controls.getByRole('spinbutton', { name: 'Height' })).toHaveValue('1080'))
      session.redo()
      await vi.waitFor(() => expect(controls.getByRole('spinbutton', { name: 'Height' })).toHaveValue('450'))
      const before = execute.mock.calls.length
      await fireEvent.input(width, { target: { value: '900' } })
      await fireEvent.pointerDown(modes.getByRole('radio', { name: 'Fit screenshot' }))
      await fireEvent.click(modes.getByRole('radio', { name: 'Fit screenshot' }))
      expect(execute).toHaveBeenCalledTimes(before + 1)
      expect(session.snapshot.core.document.presentation.composition?.layout)
        .toMatchObject({ mode: 'auto', width: 800, height: 450 })
      expect(controls.queryByRole('spinbutton', { name: 'Width' })).toBeNull()
      await fireEvent.click(modes.getByRole('radio', { name: 'Set size' }))
      expect(controls.getByRole('spinbutton', { name: 'Width' })).toHaveValue('800')
      await view.rerender({ readOnlyDocument: true })
      expect(modes.getByRole('radio', { name: 'Fit screenshot' })).toBeDisabled()
      expect(controls.getByRole('spinbutton', { name: 'Width' })).toBeDisabled()
      expect(controls.getByRole('button', { name: 'Equal padding on all sides' })).toBeDisabled()
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('explains screenshot size and corners, applies visual samples once and hides model-defined radius', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) }, correlationId: () => 'screenshot-style' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const controls = within(screen.getByRole('complementary', { name: 'Appearance' }))
      expect(controls.getByRole('spinbutton', { name: 'Screenshot size' })).toHaveValue('100')
      expect(controls.getByRole('spinbutton', { name: 'Screenshot corners' })).toHaveValue('0')
      expect(controls.getByText('Resizes the screenshot inside the canvas. 100% fits between the padding.')).toBeVisible()
      const execute = vi.spyOn(session, 'execute')
      await fireEvent.click(within(controls.getByRole('group', { name: 'Screenshot size' }))
        .getByRole('button', { name: '75%' }))
      expect(execute).toHaveBeenCalledTimes(1)
      expect(session.snapshot.core.document.presentation.composition?.layout.scale).toBe(0.75)
      session.undo()
      await vi.waitFor(() => expect(controls.getByRole('spinbutton', { name: 'Screenshot size' })).toHaveValue('100'))
      const size = controls.getByRole('spinbutton', { name: 'Screenshot size' })
      await fireEvent.input(size, { target: { value: '99' } })
      const larger = within(controls.getByRole('group', { name: 'Screenshot size' })).getByRole('button', { name: '125%' })
      await fireEvent.pointerDown(larger)
      await fireEvent.click(larger)
      expect(execute).toHaveBeenCalledTimes(2)
      expect(session.snapshot.core.document.presentation.composition?.layout.scale).toBe(1.25)
      await fireEvent.click(within(controls.getByRole('group', { name: 'Screenshot corners' }))
        .getByRole('button', { name: 'Round' }))
      expect(session.snapshot.core.document.presentation.composition?.radius).toBe(40)
      const corners = controls.getByRole('spinbutton', { name: 'Screenshot corners' })
      await fireEvent.input(corners, { target: { value: '16' } })
      await fireEvent.keyDown(corners, { key: 'Escape' })
      expect(corners).toHaveValue('40')
      await fireEvent.click(controls.getByRole('button', { name: 'Frame' }))
      await fireEvent.click(controls.getByRole('radio', { name: 'Phone' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Size and padding' }))
      expect(controls.queryByRole('spinbutton', { name: 'Frame corners' })).toBeNull()
      expect(controls.getByText('Corners follow the phone model in Frame settings.')).toBeVisible()
      await fireEvent.click(controls.getByRole('button', { name: 'Frame' }))
      await fireEvent.click(controls.getByRole('radio', { name: 'Browser' }))
      await fireEvent.click(controls.getByRole('radio', { name: 'Windows 95/98' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Size and padding' }))
      expect(controls.queryByRole('spinbutton', { name: 'Frame corners' })).toBeNull()
      expect(controls.getByText('The selected retro frame has square corners.')).toBeVisible()
      await fireEvent.click(controls.getByRole('button', { name: 'Frame' }))
      await fireEvent.click(controls.getByRole('radio', { name: 'Modern' }))
      await fireEvent.click(controls.getByRole('button', { name: 'Size and padding' }))
      expect(controls.getByRole('spinbutton', { name: 'Frame corners' })).toHaveValue('40')
      expect(controls.getByRole('spinbutton', { name: 'Framed size' })).toBeVisible()
      await view.rerender({ readOnlyDocument: true })
      expect(controls.getByRole('spinbutton', { name: 'Framed size' })).toBeDisabled()
      expect(within(controls.getByRole('group', { name: 'Frame corners' })).getByRole('button', { name: 'Round' }))
        .toBeDisabled()
    } finally {
      view.unmount()
      session.dispose()
    }
  })
})
