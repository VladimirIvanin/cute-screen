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
import { markRaw } from 'vue'
import {
  createEditorDocumentFromImage,
  parseEditorDocument,
  serializeEditorDocument,
} from '@cute-screen/editor-renderer'
import {
  DocumentSessionController,
  createEditorShellPinia,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'

const initial = () => createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000',
  baseLayerId: '019c1f62-058e-7000-8000-000000000001', timestamp: '2026-10-30T00:00:00Z',
  source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', provenance: 'fileOpen',
    width: 1080, height: 2400, orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })

describe('mockups in production editor session', () => {
  it('selects models, undoes each setting, preserves options across frame types and reopens', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
      correlationId: () => 'mockups' })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const panel = within(screen.getByRole('complementary', { name: 'Appearance' }))
      await fireEvent.click(panel.getByText('Frame', { selector: 'summary' }))
      expect(session.snapshot.core.document.presentation.composition).toBeUndefined()
      await fireEvent.click(panel.getByRole('radio', { name: 'Phone' }))
      expect(panel.getByRole('radio', { name: 'iPhone · Island' })).toBeChecked()
      expect(panel.getByRole('checkbox', { name: 'System details' })).not.toBeChecked()
      const execute = vi.spyOn(session, 'execute')
      for (const label of ['iPhone · Notch', 'Android · Rounded', 'Android · Angular']) {
        await fireEvent.click(panel.getByRole('radio', { name: label }))
        expect(panel.getByRole('radio', { name: label })).toBeChecked()
      }
      expect(execute).toHaveBeenCalledTimes(3)
      const before = session.snapshot.core.document
      await fireEvent.click(panel.getByRole('checkbox', { name: 'System details' }))
      expect(session.snapshot.core.document.presentation.composition!.frame.phoneSystemDetails).toBe(true)
      session.undo()
      await vi.waitFor(() => expect(panel.getByRole('checkbox', { name: 'System details' })).not.toBeChecked())
      session.redo()
      await vi.waitFor(() => expect(panel.getByRole('checkbox', { name: 'System details' })).toBeChecked())
      await fireEvent.change(panel.getByRole('combobox', { name: 'Screenshot placement' }), { target: { value: 'fullscreen' } })
      await fireEvent.click(panel.getByRole('radio', { name: 'Browser' }))
      for (const label of ['Windows 95/98', 'Macintosh', 'Modern']) {
        await fireEvent.click(panel.getByRole('radio', { name: label }))
        expect(panel.getByRole('radio', { name: label })).toBeChecked()
      }
      await fireEvent.click(panel.getByRole('radio', { name: 'Phone' }))
      expect(panel.getByRole('radio', { name: 'Android · Angular' })).toBeChecked()
      expect(panel.getByRole('checkbox', { name: 'System details' })).toBeChecked()
      expect(panel.getByRole('combobox', { name: 'Screenshot placement' })).toHaveValue('fullscreen')
      expect(session.snapshot.core.document.layers).toEqual(before.layers)
      const saved = parseEditorDocument(JSON.parse(serializeEditorDocument(session.snapshot.core.document)))
      if (saved.kind !== 'editable') throw new Error('editable')
      expect(saved.document.presentation.composition!.frame)
        .toEqual(session.snapshot.core.document.presentation.composition!.frame)
      await view.rerender({ readOnlyDocument: true })
      expect(panel.getByRole('radio', { name: 'iPhone · Island' })).toBeDisabled()
      expect(panel.getByRole('checkbox', { name: 'System details' })).toBeDisabled()
    } finally {
      view.unmount()
      session.dispose()
    }
  })
})
