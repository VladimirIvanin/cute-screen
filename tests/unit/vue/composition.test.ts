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
import {
  createEditorDocumentFromImage,
  createComposition,
  contentToCard,
  resolveCompositionLayout,
} from '@cute-screen/editor-renderer'
import {
  DocumentSessionController,
  createEditorShellPinia,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  compositionViewport,
  mergeCompositionView,
} from '../../../packages/editor-vue/src/shell/canvas/composition-view'
import type {
  CanvasViewportEmit,
  CanvasViewportProps,
} from '../../../packages/editor-vue/src/shell/canvas/contracts'
import {
  shallowReactive,
  markRaw,
} from 'vue'
function initial() {
  return createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000', baseLayerId: '019c1f62-058e-7000-8000-000000000001',
    timestamp: '2026-10-20T00:00:00Z', source: { blobHash: 'a'.repeat(64), format: 'png', mimeType: 'image/png', provenance: 'fileOpen',
      width: 3840, height: 2160, orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
}
describe('publication card interface', () => {
  it('opens appearance without editing and offers only padding, browser and phone starter styles', async () => {
    localStorage.clear()
    const session = new DocumentSessionController({ document: initial(), revision: 1, debounceMs: 60000,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) }, correlationId: () => 'card-ui' })
    const view = render(EditorShell,
      { props: { documentSession: markRaw(session) },
        global: { plugins: [createEditorShellPinia()] } })
    try {
      const button = await screen.findByRole('button', { name: 'Appearance' })
      expect(session.snapshot.core.canUndo).toBe(false)
      await fireEvent.click(button)
      const panel = screen.getByRole('complementary', { name: 'Appearance' })
      expect(session.snapshot.core.canUndo).toBe(false)
      expect(within(panel).getByText('Layout', { selector: 'summary' })).toBeInTheDocument()
      expect(within(panel).getByText('Background', { selector: 'summary' })).toBeInTheDocument()
      const initialFills = within(panel).getAllByRole('group', { name: 'Fill' })[0]!
      expect(within(initialFills).getByRole('button', { name: 'Transparent' })).toHaveAttribute('aria-pressed', 'true')
      const execute = vi.spyOn(session, 'execute')
      await fireEvent.click(within(initialFills).getByRole('button', { name: 'Color' }))
      expect(execute).toHaveBeenCalledTimes(1)
      expect(session.snapshot.core.document.presentation.composition?.background.kind).toBe('solid')
      expect(resolveCompositionLayout(session.snapshot.core.document)).toEqual(resolveCompositionLayout(initial()))
      session.undo()
      expect(session.snapshot.core.document.presentation.composition).toBeUndefined()
      await vi.waitFor(() => {
        expect(within(panel).getByText('Layout', { selector: 'summary' })).toBeInTheDocument()
      })
      session.redo()
      expect(session.snapshot.core.document.presentation.composition?.background.kind).toBe('solid')
      session.undo()
      expect(within(panel).queryByRole('button', { name: 'Footer strip' })).not.toBeInTheDocument()
      expect(within(panel).queryByRole('button', { name: 'Header strip' })).not.toBeInTheDocument()
      expect(within(panel).queryByRole('button', { name: 'Two strips' })).not.toBeInTheDocument()
      await fireEvent.click(within(panel).getByRole('button', { name: 'Padding' }))
      expect(session.snapshot.core.document.presentation.composition?.layout.insets.left).toBe(8)
      const fills = within(panel).getAllByRole('group', { name: 'Fill' })[0]!
      expect(within(fills).getAllByRole('button')).toHaveLength(7)
      expect(within(fills).getByRole('button', { name: 'Linear' })).toHaveAttribute('aria-pressed', 'true')
      const previous = session.snapshot.core.document.presentation.composition!.background
      await fireEvent.click(within(fills).getByRole('button', { name: 'Radial' }))
      expect(session.snapshot.core.document.presentation.composition!.background).toEqual({ ...previous, kind: 'radial' })
      session.undo()
      expect(session.snapshot.core.document.presentation.composition!.background).toEqual(previous)
      expect(screen.queryByRole('button', { name: 'On card' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'On screenshot' })).not.toBeInTheDocument()
      session.undo()
      expect(session.snapshot.core.document.presentation.composition).toBeUndefined()
      session.redo()
      expect(session.snapshot.core.document.presentation.composition?.layout.insets.left).toBe(8)
      await fireEvent.click(within(panel).getByRole('button', { name: 'Layers' }))
      expect(screen.queryByRole('complementary', { name: 'Appearance' })).not.toBeInTheDocument()
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('never offers appearance in Quick Capture', () => {
    const view = render(EditorShell, { props: { fixture: 'ready', quickMode: true }, global: { plugins: [createEditorShellPinia()] } })
    expect(view.container.querySelector('.cs-composition-panel')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Appearance' })).not.toBeInTheDocument()
  })
  it('maps full card display to source coordinates without moving source layers', () => {
    const document = initial()
    const props = shallowReactive<CanvasViewportProps>({ documentState: { kind: 'ready', title: 'Card', dimensions: '4K' },
      document: { ...document, presentation: { ...document.presentation, composition: createComposition('browser') } },
      compositionSpace: 'content', canvas: document.canvas, zoom: 100, t: (key) => key })
    const emit = vi.fn()
    const view = compositionViewport(props, emit as CanvasViewportEmit)
    const layout = resolveCompositionLayout(props.document!)
    const p = contentToCard({ x: 300, y: 400 }, layout)
    const b = view.props.compositionBounds!
    expect(b.x + p.x / layout.scale).toBeCloseTo(300)
    expect(b.y + p.y / layout.scale).toBeCloseTo(400)
    expect(view.props.document!.presentation.composition).toBeUndefined()
    props.compositionSpace = 'card'
    expect(view.props.document!.layers).toHaveLength(0)
    expect(view.props.canvas).toEqual({ width: layout.width, height: layout.height })
    expect(mergeCompositionView(props.document, view.props.document, 'card')!.layers).toEqual(document.layers)
    props.activeTool = 'crop'
    expect(view.props.document!.presentation.composition).toBeUndefined()
    expect(view.props.exportDocument!.presentation.composition).toEqual(props.document!.presentation.composition)
  })
})
