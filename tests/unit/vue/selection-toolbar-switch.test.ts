import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/vue'
import { markRaw } from 'vue'
import {
  afterEach,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createEditorShellPinia,
  DocumentSessionController,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  canvasContext,
  documentFixture,
  precisionLayerFixture,
  prepareScene,
} from './m08-precision-test-kit'

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())

it.each(['spotlight', 'censor'] as const)('switches the selection toolbar from loupe to %s and back on canvas clicks', async (kind) => {
  const spotlight = precisionLayerFixture(kind)
  const loupe = precisionLayerFixture('loupe')
  const session = new DocumentSessionController({
    document: { ...documentFixture(), layers: [spotlight, loupe] },
    revision: 1,
    bridge: {
      saveDocument: async () => 2,
      exportRecoveryBundle: async () => ({ kind: 'saved' }),
    },
    correlationId: () => 'selection-switch',
    debounceMs: 60_000,
  })
  const pinia = createEditorShellPinia()
  const view = render(EditorShell, {
    props: { documentSession: markRaw(session) },
    global: { plugins: [pinia] },
  })
  await fireEvent.click(screen.getByRole('button', { name: 'Select' }))
  const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
  prepareScene(scene)
  const store = useEditorShellStore(pinia)
  const execute = vi.spyOn(session, 'execute')
  for (const [x, y, layer, name] of [
    [85, 40, loupe, 'Zoom'],
    [35, 20, spotlight, kind === 'spotlight' ? 'Dimming' : 'Effect'],
    [85, 40, loupe, 'Zoom'],
    [35, 20, spotlight, kind === 'spotlight' ? 'Dimming' : 'Effect'],
  ] as const) {
    await fireEvent.pointerDown(scene, { pointerId: 1, button: 0, clientX: x, clientY: y })
    await fireEvent.pointerUp(scene, { pointerId: 1, button: 0, clientX: x, clientY: y })
    expect(store.selectedLayerIds).toEqual([layer.id])
    const toolbar = view.container.querySelector('.cs-selection-floating-toolbar') as HTMLElement
    expect(within(toolbar).getByRole(name === 'Effect' ? 'combobox' : 'button', { name })).toBeInTheDocument()
    expect(within(toolbar).queryByRole('button', { name: name === 'Zoom' ? 'Dimming' : 'Zoom' })).toBeNull()
  }
  expect(execute).not.toHaveBeenCalled()
  session.dispose()
  view.unmount()
})
