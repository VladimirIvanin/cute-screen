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
  DocumentSessionController,
  createEditorShellPinia,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import { ActionCancelledError } from '../../../packages/editor-vue/src/shell/store-actions'
import { compositionFixture as initial } from './composition-test-kit'

describe('appearance while copying', () => {
  it.each(['success', 'error', 'cancel'] as const)('keeps appearance controls stable through copy %s', async (outcome) => {
    localStorage.clear()
    let complete!: () => void
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) }, correlationId: () => 'copy' })
    const view = render(EditorShell, { props: {
      documentSession: markRaw(session),
      initialDocumentState: { kind: 'ready', title: 'Screenshot', dimensions: '4K' },
      actions: { run: async () => {
        await new Promise<void>((resolve) => {
          complete = resolve
        })
        if (outcome === 'error') throw new Error('Clipboard busy')
        if (outcome === 'cancel') throw new ActionCancelledError('Copy cancelled')
        return 'Result copied'
      } },
    }, global: { plugins: [createEditorShellPinia()] } })
    try {
      await fireEvent.click(await screen.findByRole('button', { name: 'Appearance' }))
      const panel = screen.getByRole('complementary', { name: 'Appearance' })
      const starter = within(panel).getByRole('button', { name: 'Browser' })
      await fireEvent.click(starter)
      await fireEvent.click(within(panel).getByRole('button', { name: 'Background' }))
      const body = panel.querySelector('.cs-composition-body')!
      body.scrollTop = 100
      const before = session.snapshot.core.document
      const changes: MutationRecord[] = []
      const observer = new MutationObserver((records) => changes.push(...records))
      observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['disabled'] })
      await fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
      expect(panel).toHaveAttribute('inert')
      expect(panel).toHaveAttribute('aria-busy', 'true')
      expect(starter).toBeEnabled()
      // Even synthetic input bypassing inert cannot commit a command while copying.
      await fireEvent.click(starter)
      expect(session.snapshot.core.document).toBe(before)
      complete()
      await vi.waitFor(() => expect(panel).toHaveAttribute('aria-busy', 'false'))
      expect(panel).not.toHaveAttribute('inert')
      expect(panel.querySelector('[data-active-section]')).toHaveAttribute('data-active-section', 'background')
      expect(body.scrollTop).toBe(100)
      expect(panel.querySelector('[data-composition-start="browser"]')).toBe(starter)
      expect(changes).toHaveLength(0)
      observer.disconnect()
      if (outcome === 'error') expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Clipboard busy'))).toBe(true)
    } finally {
      view.unmount()
      session.dispose()
    }
  })
})
