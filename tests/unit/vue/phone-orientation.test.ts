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

function initial(
  width: number,
  height: number,
) {
  return createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000',
    baseLayerId: '019c1f62-058e-7000-8000-000000000001', timestamp: '2026-10-29T00:00:00Z',
    source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', provenance: 'capture',
      width, height, orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
}

function mount(document = initial(3840, 2160)) {
  const session = new DocumentSessionController({ document, revision: 1, debounceMs: 60000,
    bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
    correlationId: () => 'phone-orientation' })
  const view = render(EditorShell, { props: { documentSession: markRaw(session) },
    global: { plugins: [createEditorShellPinia()] } })
  return { session, view, dispose: () => {
    view.unmount()
    session.dispose()
  } }
}

async function openFrame() {
  await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
  const panel = within(screen.getByRole('complementary', { name: 'Appearance' }))
  await fireEvent.click(panel.getByText('Frame', { selector: 'summary' }))
  return panel
}

describe('phone orientation in the editor', () => {
  it.each([
    [3840, 2160, 'landscape', 'starter'],
    [1080, 2400, 'portrait', 'starter'],
    [3840, 2160, 'landscape', 'tile'],
    [1080, 2400, 'portrait', 'tile'],
    [1440, 1440, 'portrait', 'tile'],
  ] as const)('initializes %s × %s as %s from %s', async (width, height, orientation, entry) => {
    localStorage.clear()
    const app = mount(initial(width, height))
    try {
      const panel = await openFrame()
      const execute = vi.spyOn(app.session, 'execute')
      await fireEvent.click(panel.getByRole(entry === 'starter' ? 'button' : 'radio', { name: 'Phone' }))
      const expected = orientation === 'portrait' ? 'Portrait' : 'Landscape'
      expect(panel.getByRole('button', { name: 'Rotate mockup' })).toHaveTextContent(expected)
      expect(app.session.snapshot.core.document.presentation.phoneOrientation).toBe(orientation)
      expect(execute).toHaveBeenCalledTimes(1)
      app.session.undo()
      await vi.waitFor(() => expect(panel.getByRole('radio', { name: 'No frame' })).toBeChecked())
      expect(app.session.snapshot.core.document.presentation.phoneOrientation).toBeUndefined()
      app.session.redo()
      await vi.waitFor(() => expect(panel.getByRole('button', { name: 'Rotate mockup' })).toHaveTextContent(expected))
    } finally {
      app.dispose()
    }
  })

  it('keeps manual choice through settings, repeat style, panel reopen, removal and document reopen', async () => {
    localStorage.clear()
    let app = mount()
    try {
      let panel = await openFrame()
      await fireEvent.click(panel.getByRole('button', { name: 'Phone' }))
      const orientation = panel.getByRole('button', { name: 'Rotate mockup' })
      const execute = vi.spyOn(app.session, 'execute')
      expect(orientation).toHaveAttribute('title', 'Rotate to portrait')
      await fireEvent.click(orientation)
      expect(execute).toHaveBeenCalledTimes(1)
      expect(orientation).toHaveAttribute('title', 'Rotate to landscape')
      app.session.undo()
      await vi.waitFor(() => expect(orientation).toHaveTextContent('Landscape'))
      app.session.redo()
      await vi.waitFor(() => expect(orientation).toHaveTextContent('Portrait'))
      await fireEvent.change(panel.getByRole('combobox', { name: 'Frame theme' }), { target: { value: 'light' } })
      expect(orientation).toHaveTextContent('Portrait')
      await fireEvent.click(panel.getByRole('button', { name: 'Phone' }))
      expect(orientation).toHaveTextContent('Portrait')
      await fireEvent.click(panel.getByRole('radio', { name: 'Browser' }))
      await fireEvent.click(panel.getByRole('radio', { name: 'Phone' }))
      expect(panel.getByRole('button', { name: 'Rotate mockup' })).toHaveTextContent('Portrait')
      await fireEvent.click(panel.getByRole('button', { name: 'Close appearance' }))
      panel = await openFrame()
      expect(panel.getByRole('button', { name: 'Rotate mockup' })).toHaveTextContent('Portrait')
      await fireEvent.click(panel.getByRole('button', { name: 'Remove appearance' }))
      const restored = parseEditorDocument(JSON.parse(serializeEditorDocument(app.session.snapshot.core.document)))
      if (restored.kind !== 'editable') throw new Error('editable document expected')
      expect(restored.document.presentation.composition).toBeUndefined()
      expect(restored.document.presentation.phoneOrientation).toBe('portrait')
      app.dispose()
      app = mount(restored.document)
      panel = await openFrame()
      await fireEvent.click(panel.getByRole('button', { name: 'Phone' }))
      expect(panel.getByRole('button', { name: 'Rotate mockup' })).toHaveTextContent('Portrait')
      await app.view.rerender({ readOnlyDocument: true })
      expect(panel.getByRole('button', { name: 'Rotate mockup' })).toBeDisabled()
    } finally {
      app.dispose()
    }
  })
})
