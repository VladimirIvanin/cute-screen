import {
  fireEvent,
  render,
  screen,
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
import {
  createEditorShellPinia,
  DocumentSessionController,
} from '@cute-screen/editor-vue'
import {
  DEFAULT_DRAWING_DEFAULTS,
  createDrawingLayer,
  type PencilLayer,
  type PencilLayerPayload,
} from '@cute-screen/editor-core'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  canvasContext,
  documentFixture,
  prepareScene,
} from './m08-precision-test-kit'
import { selectLayerFromPanel } from './layer-selection'

beforeEach(() => {
  window.localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())

describe('ink input and settings', () => {
  it('collects empty-coalesced fallback, freezes pressure mode and adds the release endpoint', async () => {
    const view = render(CanvasViewport, { props: {
      documentState: { kind: 'ready', title: 'Ink', dimensions: '120 × 80' },
      document: documentFixture(), canvas: { width: 120, height: 80 }, zoom: 100, fitMode: false,
      t: (key: string) => key, activeTool: 'pencil', drawingDefaults: DEFAULT_DRAWING_DEFAULTS,
    } })
    const scene = view.container.querySelector<HTMLCanvasElement>('.cs-canvas')!
    prepareScene(scene)
    await fireEvent.pointerDown(scene, { pointerId: 2, clientX: 10, clientY: 20, pointerType: 'pen', pressure: .7 })
    const move = new PointerEvent('pointermove', { pointerId: 2, clientX: 35, clientY: 30,
      pointerType: 'pen', pressure: .8, bubbles: true })
    Object.defineProperty(move, 'getCoalescedEvents', { value: () => [] })
    await fireEvent(scene, move)
    await view.rerender({ drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS,
      pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil, brush: 'brush', width: 30 } } })
    expect(view.emitted('addLayer')).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 2, clientX: 50, clientY: 40, pointerType: 'pen', pressure: 0 })
    expect(view.emitted('addLayer')).toHaveLength(1)
    const additions = view.emitted().addLayer as unknown as readonly (readonly unknown[])[]
    const stroke = additions[0]![0] as PencilLayer
    const payload = stroke.payload as PencilLayerPayload
    expect(stroke.payload).toMatchObject({ brush: 'stabilized', width: 3, pressureMode: 'pen' })
    expect(payload.points).toHaveLength(3)
    const last = payload.points.at(-1)!
    expect(last.pressure).toBeCloseTo(.8)
    expect(last.x + stroke.transform.translateX).toBe(50)
    expect(last.y + stroke.transform.translateY).toBe(40)
  })
  it('does not rerender Vue components on each drawing pointermove', async () => {
    let updates = 0
    const view = render(CanvasViewport, { props: {
      documentState: { kind: 'ready', title: 'Ink', dimensions: '120 × 80' },
      document: documentFixture(), canvas: { width: 120, height: 80 }, zoom: 100, fitMode: false,
      t: (key: string) => key, activeTool: 'pencil',
    }, global: { mixins: [{ updated() {
      updates++
    } }] } })
    const scene = view.container.querySelector<HTMLCanvasElement>('.cs-canvas')!
    prepareScene(scene)
    await fireEvent.pointerDown(scene, { pointerId: 7, clientX: 10, clientY: 20 })
    const before = updates
    for (let index = 0; index < 30; index++) {
      await fireEvent.pointerMove(scene, { pointerId: 7, clientX: 15 + index * 2, clientY: 30 + index % 2 })
    }
    expect(updates - before).toBeLessThan(2)
    expect(view.emitted('addLayer')).toBeUndefined()
    await fireEvent.pointerCancel(scene, { pointerId: 7 })
  })
  it.each(['pointerCancel', 'escape'])('cancels a draft via %s without a document change', async (cancel) => {
    const view = render(CanvasViewport, { props: { documentState: { kind: 'ready', title: 'Ink', dimensions: '120 × 80' },
      document: documentFixture(), canvas: { width: 120, height: 80 }, zoom: 100, fitMode: false,
      t: (key: string) => key, activeTool: 'pencil' } })
    const scene = view.container.querySelector<HTMLCanvasElement>('.cs-canvas')!
    prepareScene(scene)
    await fireEvent.pointerDown(scene, { pointerId: 3, clientX: 10, clientY: 20 })
    await fireEvent.pointerMove(scene, { pointerId: 3, clientX: 35, clientY: 30 })
    if (cancel === 'escape') await fireEvent.keyDown(scene, { key: 'Escape' })
    else await fireEvent.pointerCancel(scene, { pointerId: 3 })
    await fireEvent.pointerUp(scene, { pointerId: 3, clientX: 35, clientY: 30 })
    expect(view.emitted('addLayer')).toBeUndefined()
  })
  it('remembers each correction through the mounted defaults flow', async () => {
    const session = new DocumentSessionController({ document: documentFixture(), revision: 1,
      bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
      correlationId: () => 'ink-defaults', debounceMs: 60000 })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Pencil' }))
    async function correction(value: string): Promise<void> {
      await fireEvent.click(screen.getByRole('button', { name: 'Correction' }))
      const input = await screen.findByRole('spinbutton', { name: 'Correction' })
      await fireEvent.input(input, { target: { value } })
      await fireEvent.keyDown(input, { key: 'Enter' })
      await fireEvent.keyDown(input, { key: 'Escape' })
    }
    async function brush(name: string): Promise<void> {
      await fireEvent.click(screen.getByRole('button', { name: 'Brush and width' }))
      const panel = await screen.findByRole('dialog', { name: 'Brush and width' })
      await fireEvent.click(within(panel).getByRole('button', { name }))
      await fireEvent.keyDown(panel, { key: 'Escape' })
    }
    await correction('80')
    await brush('Expressive brush')
    await correction('20')
    await brush('Autocorrection')
    await fireEvent.click(screen.getByRole('button', { name: 'Correction' }))
    expect(await screen.findByRole('spinbutton', { name: 'Correction' })).toHaveValue('80')
    await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Correction' }), { key: 'Escape' })
    await brush('Expressive brush')
    await fireEvent.click(screen.getByRole('button', { name: 'Correction' }))
    expect(await screen.findByRole('spinbutton', { name: 'Correction' })).toHaveValue('20')
    expect(session.snapshot.core.document.layers).toHaveLength(0)
    session.dispose()
    view.unmount()
  })
  it('changes selected brush in one undoable command and disables exact pen correction', async () => {
    const stroke = createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000819', tool: 'pencil',
      start: { x: 10, y: 10 }, end: { x: 70, y: 35 } })!
    const session = new DocumentSessionController({ document: { ...documentFixture(), layers: [stroke] },
      revision: 1, bridge: { saveDocument: async () => 2, exportRecoveryBundle: async () => ({ kind: 'saved' }) },
      correlationId: () => 'ink', debounceMs: 60000 })
    const view = render(EditorShell, { props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] } })
    await selectLayerFromPanel(view)
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(screen.getByRole('button', { name: 'Brush and width' }))
    const panel = await screen.findByRole('dialog', { name: 'Brush and width' })
    expect(panel.querySelectorAll('.cs-brush-choices button')).toHaveLength(3)
    await fireEvent.click(within(panel).getByRole('button', { name: 'Exact pen' }))
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.snapshot.core.document.layers[0]!.payload).toMatchObject({ brush: 'pen', strokeVersion: 2 })
    expect(screen.getByRole('button', { name: 'Correction' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Correction' })).toHaveAttribute('title', expect.stringContaining('without correction'))
    session.undo()
    expect(session.snapshot.core.document.layers[0]).toEqual(stroke)
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({ payload: { brush: 'pen' } })
    session.dispose()
    view.unmount()
  })
})
