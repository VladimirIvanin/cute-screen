import {
  fireEvent,
  render,
  screen,
  within,
  waitFor,
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
import {
  createEditorShellPinia,
  DocumentSessionController,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  canvasContext,
  documentFixture,
  precisionLayerFixture,
} from './m08-precision-test-kit'
import { selectLayerFromPanel } from './layer-selection'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())

function mount(
  locked = false,
  readOnlyDocument = false,
  crop = { x: 10, y: 10, width: 100, height: 60 },
) {
  const source = precisionLayerFixture('ruler')
  const layer = { ...source, locked }
  const session = new DocumentSessionController({
    document: { ...documentFixture(crop), layers: [layer] }, revision: 1,
    bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
    correlationId: () => 'ruler-toolbar', debounceMs: 60000,
  })
  const view = render(EditorShell, {
    props: { documentSession: markRaw(session), readOnlyDocument }, global: { plugins: [createEditorShellPinia()] },
  })
  return { view, session }
}

describe('ruler units separated from typography', () => {
  it('shows meaningful closed controls and commits the whole measurement mode once with undo/redo', async () => {
    const { view, session } = mount()
    await selectLayerFromPanel(view)
    const toolbar = view.container.querySelector('.cs-selection-floating-toolbar') as HTMLElement
    expect(within(toolbar).getByRole('button', { name: 'Thickness' }).querySelector('svg')).toBeTruthy()
    expect(within(toolbar).getByRole('button', { name: 'Label size' })).toHaveTextContent('Aa 14 px')
    const measurement = within(toolbar).getByRole('button', { name: 'Measurement and snapping' })
    expect(measurement.querySelector('svg')).toBeTruthy()
    await fireEvent.click(measurement)
    const panel = screen.getByRole('dialog', { name: 'Measurement and snapping' })
    expect(panel).toHaveTextContent('Crop area: 100 × 60 px')
    for (const name of ['Pixels', '% of width', '% of height', '% of diagonal']) expect(within(panel).getByRole('button', { name })).toBeEnabled()
    const before = session.snapshot.core.document
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(within(panel).getByRole('button', { name: '% of height' }))
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.snapshot.core.document.layers[0]).toMatchObject({ payload: { unit: 'percent', percentBasis: 'canvasHeight' } })
    await waitFor(() => expect(measurement).toHaveTextContent('% of height'))
    const after = session.snapshot.core.document
    session.undo()
    expect(session.snapshot.core.document).toEqual(before)
    session.redo()
    expect(session.snapshot.core.document).toEqual(after)
    await waitFor(() => expect(JSON.parse(localStorage.getItem('cute-screen.tool-settings.v3')!).settings.precision.ruler).toMatchObject({ unit: 'percent', percentBasis: 'canvasHeight' }))
    await fireEvent.keyDown(panel, { key: 'Escape' })
    await waitFor(() => expect(measurement).toHaveFocus())
    await fireEvent.click(within(toolbar).getByRole('button', { name: 'Label size' }))
    const textPanel = screen.getByRole('dialog', { name: 'Label size' })
    expect(within(textPanel).queryByRole('button', { name: '% of height' })).not.toBeInTheDocument()
    expect(within(textPanel).getByRole('spinbutton', { name: 'Label size' })).toHaveValue('14')
    session.dispose()
    view.unmount()
  })

  it('keeps fractional crop dimensions readable without rounding the measurement model', async () => {
    const crop = { x: 10, y: 10, width: 100.12345678, height: 60.98765432 }
    const { view, session } = mount(false, false, crop)
    await selectLayerFromPanel(view)
    await fireEvent.click(screen.getByRole('button', { name: 'Measurement and snapping' }))
    expect(screen.getByRole('dialog', { name: 'Measurement and snapping' })).toHaveTextContent('Crop area: 100.12 × 60.99 px')
    expect(session.snapshot.core.document.crop).toEqual(crop)
    session.dispose()
    view.unmount()
  })

  it.each([[true, false], [false, true]])('blocks modes while keeping copy accessible (locked %s, read-only %s)', async (locked, readOnly) => {
    const { view, session } = mount(locked, readOnly)
    await selectLayerFromPanel(view)
    await fireEvent.click(screen.getByRole('button', { name: 'Measurement and snapping' }))
    const panel = screen.getByRole('dialog', { name: 'Measurement and snapping' })
    expect(within(panel).getByRole('button', { name: '% of width' })).toBeDisabled()
    expect(within(panel).getByRole('button', { name: 'Copy length' })).toBeEnabled()
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Copy length' })).toHaveFocus())
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(within(panel).getByRole('button', { name: '% of width' }))
    expect(execute).not.toHaveBeenCalled()
    session.dispose()
    view.unmount()
  })

  it.each([false, true])('restores a legacy diagonal basis only for existing preferences (%s)', async (legacy) => {
    if (legacy) localStorage.setItem('cute-screen.tool-settings.v3', JSON.stringify({ schemaVersion: 3, settings: { precision: { ruler: { unit: 'percent' } } } }))
    const { view, session } = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Ruler' }))
    const toolbar = view.container.querySelector('.cs-tool-defaults-toolbar') as HTMLElement
    const measurement = within(toolbar).getByRole('button', { name: 'Measurement and snapping' })
    expect(measurement).toHaveTextContent(legacy ? '% of diagonal' : 'px')
    await fireEvent.click(measurement)
    expect(screen.getByRole('button', { name: legacy ? '% of diagonal' : 'Pixels' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(screen.getByRole('button', { name: '% of width' }))
    expect(measurement).toHaveTextContent('% of width')
    expect(session.snapshot.core.canUndo).toBe(false)
    session.dispose()
    view.unmount()
  })
})
