import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  markRaw,
  nextTick,
} from 'vue'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
  type ArrowLayer,
} from '@cute-screen/editor-renderer'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  arrowDocument,
  arrowSession,
} from './app-test-kit'
import {
  prepareScene,
  canvasContext,
} from './m08-precision-test-kit'
import { updateLineGesture } from '../../../packages/editor-vue/src/shell/canvas/line-gesture'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    ...canvasContext(), bezierCurveTo: vi.fn(),
  })
})
afterEach(() => vi.restoreAllMocks())

function mount(quickMode = false) {
  const session = arrowSession({ ...arrowDocument(), layers: [] })
  const pinia = createEditorShellPinia()
  const view = render(EditorShell, {
    props: { documentSession: markRaw(session), quickMode }, global: { plugins: [pinia] },
  })
  const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
  prepareScene(scene)
  return { session, view, scene, store: useEditorShellStore(pinia), close: () => {
    view.unmount()
    session.dispose()
  } }
}
async function drag(
  scene: HTMLCanvasElement,
  endX = 75,
  endY = 42,
) {
  await fireEvent.pointerDown(scene, { button: 0, pointerId: 1, clientX: 20, clientY: 40 })
  await fireEvent.pointerMove(scene, { pointerId: 1, clientX: endX, clientY: endY })
  await fireEvent.pointerUp(scene, { pointerId: 1, clientX: endX, clientY: endY })
}

describe('line through the mounted editor', () => {
  it('configures hand-drawn defaults and preserves the selected line seed through style history', async () => {
    const app = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    const stroke = app.view.container.querySelector('.cs-tool-defaults-toolbar [data-control="stroke"] button')!
    await fireEvent.click(stroke)
    await fireEvent.click(await screen.findByRole('button', { name: 'Hand-drawn' }))
    await drag(app.scene, 90, 60)
    const line = app.session.snapshot.core.document.layers[0] as ArrowLayer
    expect(line.payload.appearance).toBe('handDrawn')
    expect(line.payload.sketchSeed).toBeGreaterThan(0)
    app.store.selectTool('select')
    app.store.selectLayer(line.id)
    await nextTick()
    await fireEvent.click(app.view.container.querySelector('.cs-selection-floating-toolbar [data-control="stroke"] button')!)
    await fireEvent.click(await screen.findByRole('button', { name: 'Clean' }))
    expect((app.session.snapshot.core.document.layers[0] as ArrowLayer).payload).toMatchObject({
      appearance: 'clean', sketchSeed: line.payload.sketchSeed,
    })
    app.session.undo()
    expect((app.session.snapshot.core.document.layers[0] as ArrowLayer).payload.appearance).toBe('handDrawn')
    await fireEvent.click(screen.getByRole('button', { name: 'Arrow' }))
    await fireEvent.click(app.view.container.querySelector('.cs-tool-defaults-toolbar [data-control="stroke"] button')!)
    expect(await screen.findByRole('button', { name: 'Clean' })).toHaveAttribute('aria-pressed', 'true')
    app.close()
  })

  it('creates aligned lines in series with a single undo step per gesture', async () => {
    const app = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    await drag(app.scene)
    await drag(app.scene, 65, 41)
    const layers = app.session.snapshot.core.document.layers as ArrowLayer[]
    expect(layers).toHaveLength(2)
    expect(layers.every((layer) => layer.payload.annotationTool === 'line' && layer.payload.start.y === layer.payload.end.y)).toBe(true)
    expect(app.store.activeToolId).toBe('line')
    expect(app.store.selectedLayerIds).toHaveLength(0)
    app.session.undo()
    expect(app.session.snapshot.core.document.layers).toHaveLength(1)
    app.session.redo()
    expect(app.session.snapshot.core.document.layers).toEqual(layers)
    app.close()
  })
  it('uses physical L/Z without stealing text input or Ctrl+Z', async () => {
    const app = mount()
    await fireEvent.keyDown(window, { code: 'KeyL', key: 'д' })
    expect(app.store.activeToolId).toBe('line')
    await fireEvent.keyDown(window, { code: 'KeyZ', key: 'я' })
    expect(app.store.activeToolId).toBe('loupe')
    await fireEvent.keyDown(window, { code: 'KeyZ', key: 'я', ctrlKey: true })
    expect(app.store.activeToolId).toBe('loupe')
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    await fireEvent.keyDown(input, { code: 'KeyL', key: 'l' })
    expect(app.store.activeToolId).toBe('loupe')
    input.remove()
    app.close()
  })
  it('does not commit short, cancelled, or blurred gestures in Quick', async () => {
    const app = mount(true)
    await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    await drag(app.scene, 22, 40)
    expect(app.session.snapshot.core.document.layers).toHaveLength(0)
    for (const cancel of ['Escape', 'pointercancel', 'blur']) {
      await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 1, clientX: 20, clientY: 40 })
      await fireEvent.pointerMove(app.scene, { pointerId: 1, clientX: 70, clientY: 41 })
      if (cancel === 'Escape') await fireEvent.keyDown(window, { key: 'Escape' })
      else if (cancel === 'blur') await fireEvent.blur(window)
      else await fireEvent.pointerCancel(app.scene, { pointerId: 1 })
      await fireEvent.pointerUp(app.scene, { pointerId: 1, clientX: 70, clientY: 41 })
      expect(app.session.snapshot.core.document.layers).toHaveLength(0)
    }
    app.close()
  })
  it('remembers alignment independently and keeps it out of document payloads', async () => {
    const app = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    const alignment = screen.getByRole('button', { name: 'Align to axes' })
    expect(alignment).toHaveAttribute('aria-pressed', 'true')
    expect(alignment.querySelector('svg')).toHaveClass('tabler-icon-magnet')
    expect(alignment.textContent?.trim()).toBe('')
    expect(app.view.container.querySelector('.cs-line-hint')).toBeNull()
    await fireEvent.click(alignment)
    expect(alignment.querySelector('svg')).toHaveClass('tabler-icon-magnet-off')
    await drag(app.scene)
    const layer = app.session.snapshot.core.document.layers[0] as ArrowLayer
    expect(layer.payload.start.y).not.toBe(layer.payload.end.y)
    expect(layer.payload).not.toHaveProperty('autoAlignAxes')
    app.close()
    const reopened = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    expect(screen.getByRole('button', { name: 'Align to axes' })).toHaveAttribute('aria-pressed', 'false')
    reopened.close()
  })
  it('uses final pointerup coordinates and Shift changes without another pointermove', async () => {
    const app = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
    await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 1, clientX: 20, clientY: 20 })
    await fireEvent.pointerMove(app.scene, { pointerId: 1, clientX: 65, clientY: 55 })
    await fireEvent.keyDown(window, { key: 'Shift', shiftKey: true })
    await fireEvent.pointerUp(app.scene, { pointerId: 1, clientX: 70, clientY: 60, shiftKey: true })
    const layer = app.session.snapshot.core.document.layers[0] as ArrowLayer
    expect(layer.payload.end.x - layer.payload.start.x).toBeCloseTo(layer.payload.end.y - layer.payload.start.y)
    app.store.selectTool('select')
    app.store.selectLayer(layer.id)
    await nextTick()
    expect(app.view.container.querySelector('.cs-selection-floating-toolbar')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Align to axes' })).not.toBeInTheDocument()
    app.close()
  })
  it('aligns a rotated endpoint in world coordinates around its fixed opposite endpoint', () => {
    const original = createDrawingLayer({ id: 'line', tool: 'line', start: { x: 20, y: 40 }, end: { x: 100, y: 40 } }) as ArrowLayer
    const layer = { ...original, transform: { ...original.transform, rotation: 90 } }
    const point = {
      x: layer.transform.translateX - layer.payload.start.y, y: layer.transform.translateY + layer.payload.start.x,
    }
    const gesture = updateLineGesture({ kind: 'arrowHandle', id: layer.id, handle: 'end', start: point, current: point },
      { x: point.x + 100, y: point.y + 2 }, false, false,
      { document: { ...arrowDocument(), layers: [layer] }, drawingDefaults: DEFAULT_DRAWING_DEFAULTS })
    expect(gesture.current).toEqual({ x: point.x + 100, y: point.y })
  })
})

it('inherits selected line styles only into line defaults and blocks locked/read-only edits', async () => {
  const app = mount()
  await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
  await drag(app.scene)
  const layer = app.session.snapshot.core.document.layers[0]!
  app.store.selectTool('select')
  app.store.selectLayer(layer.id)
  await nextTick()
  const selection = app.view.container.querySelector('.cs-selection-floating-toolbar')!
  await fireEvent.click(selection.querySelector('[data-control="stroke"] button')!)
  const thickness = await screen.findByRole('spinbutton', { name: 'Thickness' })
  await fireEvent.focus(thickness)
  await fireEvent.input(thickness, { target: { value: '7' } })
  await fireEvent.keyDown(thickness, { key: 'Enter' })
  const changed = app.session.snapshot.core.document.layers[0] as ArrowLayer
  expect(changed.payload.stroke.width).toBe(7)
  await fireEvent.keyDown(window, { key: 'Escape' })
  await fireEvent.click(screen.getByRole('button', { name: 'Arrow' }))
  const arrowStroke = app.view.container.querySelector('.cs-tool-defaults-toolbar [data-control="stroke"] button')!
  expect(arrowStroke).toHaveAttribute('aria-label', 'Stroke: 8 px')
  await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
  expect(app.view.container.querySelector('.cs-tool-defaults-toolbar [data-control="stroke"] button'))
    .toHaveAttribute('aria-label', 'Stroke: 7 px')
  app.store.selectTool('select')
  app.store.selectLayer(layer.id)
  app.session.execute({ type: 'updateLayer', before: changed, after: { ...changed, locked: true } })
  await nextTick()
  expect(app.view.container.querySelector('.cs-selection-floating-toolbar [data-control="stroke"] button')).toBeDisabled()
  await app.view.rerender({ readOnlyDocument: true })
  expect(screen.getByRole('button', { name: 'Line' })).toBeDisabled()
  app.close()
})

it('shows mixed line stroke values independently and changes the group with one undo step', async () => {
  const app = mount()
  await fireEvent.click(screen.getByRole('button', { name: 'Line' }))
  await drag(app.scene)
  await drag(app.scene, 65, 65)
  const [first, second] = app.session.snapshot.core.document.layers as ArrowLayer[]
  const changed = { ...second!, payload: { ...second!.payload, appearance: 'handDrawn' as const,
    stroke: { ...second!.payload.stroke, width: 7, style: 'dashed' as const } } }
  app.session.execute({ type: 'updateLayer', before: second!, after: changed })
  app.store.selectTool('select')
  app.store.selectLayer(first!.id)
  app.store.selectLayer(second!.id, true)
  await nextTick()
  const selection = app.view.container.querySelector('.cs-selection-floating-toolbar')!
  await fireEvent.click(selection.querySelector('[data-control="stroke"] button')!)
  const thickness = await screen.findByRole('spinbutton', { name: 'Thickness' })
  expect(thickness).toHaveValue('')
  for (const name of ['Solid', 'Dashed', 'Dotted'])
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  for (const name of ['Clean', 'Hand-drawn'])
    expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false')
  await fireEvent.focus(thickness)
  await fireEvent.input(thickness, { target: { value: '5' } })
  await fireEvent.keyDown(thickness, { key: 'Enter' })
  expect(
    (app.session.snapshot.core.document.layers as ArrowLayer[]).map((layer) => layer.payload.stroke.width),
  ).toEqual([5, 5])
  expect(thickness).toHaveValue('5')
  expect(screen.getByRole('button', { name: 'Solid' })).toHaveAttribute('aria-pressed', 'false')
  app.session.undo()
  expect(
    (app.session.snapshot.core.document.layers as ArrowLayer[]).map((layer) => layer.payload.stroke.width),
  ).toEqual([4, 7])
  await nextTick()
  await fireEvent.click(screen.getByRole('button', { name: 'Hand-drawn' }))
  expect(
    (app.session.snapshot.core.document.layers as ArrowLayer[]).map((layer) => layer.payload.appearance),
  ).toEqual(['handDrawn', 'handDrawn'])
  expect(
    (app.session.snapshot.core.document.layers as ArrowLayer[]).map((layer) => layer.payload.sketchSeed),
  ).toEqual([first!.payload.sketchSeed, second!.payload.sketchSeed])
  app.session.undo()
  expect(
    (app.session.snapshot.core.document.layers as ArrowLayer[]).map((layer) => layer.payload.appearance),
  ).toEqual(['clean', 'handDrawn'])
  app.close()
})
