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
  within,
} from '@testing-library/vue'
import {
  markRaw,
  nextTick,
} from 'vue'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import {
  arrowDocument,
  arrowSession,
} from './app-test-kit'
import {
  prepareScene,
  canvasContext,
} from './m08-precision-test-kit'
import {
  createDrawingLayer,
  createCalloutLayer,
  type EditorDocumentV1,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import { TOOL_SETTINGS_STORAGE_KEY } from '../../../packages/editor-vue/src/shell/workspace/tool-settings-memory'
import { TextureResourceResolver } from '../../../packages/editor-vue/src/texture-fill'
import { HighlighterBackgroundController } from '../../../packages/editor-vue/src/shell/workspace/highlighter-background'

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())
function mount(
  document: EditorDocumentV1 = { ...arrowDocument(), layers: [] },
  quickMode = false,
) {
  const session = arrowSession(document)
  const pinia = createEditorShellPinia()
  const view = render(EditorShell, {
    props: { documentSession: markRaw(session), quickMode },
    global: { plugins: [pinia] },
  })
  const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
  prepareScene(scene)
  return {
    view,
    scene,
    session,
    store: useEditorShellStore(pinia),
    close: () => {
      view.unmount()
      session.dispose()
    },
  }
}
function shapePayload(layer: LayerNode) {
  if (layer.kind !== 'shape') throw new Error('expected shape')
  return layer.payload
}
async function draw(
  scene: HTMLCanvasElement,
  x = 65,
) {
  await fireEvent.pointerDown(scene, {
    button: 0,
    pointerId: 1,
    clientX: 20,
    clientY: 20,
  })
  await fireEvent.pointerMove(scene, {
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: 55,
  })
  await fireEvent.pointerUp(scene, {
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: 55,
  })
}
describe('consistent tool UX through the mounted shell', () => {
  it('targets callout context actions in Quick full-frame coordinates with a non-origin crop', async () => {
    const callout = createCalloutLayer({ id: '019c1f62-058e-7000-8000-000000000099',
      target: { x: 40, y: 50 }, label: { x: 80, y: 30 }, text: 'Label' }, {})!
    const app = mount({ ...arrowDocument(), crop: { x: 20, y: 10, width: 70, height: 70 }, layers: [callout] }, true)
    app.store.selectTool('select')
    app.store.selectLayer(callout.id)
    await nextTick()
    await fireEvent.contextMenu(app.scene, { clientX: 48, clientY: 40 })
    expect(screen.getByRole('menuitem', { name: 'Add step' })).toBeEnabled()
    app.close()
  })
  it('uses common properties for an arrow and pencil regardless of their order', async () => {
    const arrow = arrowDocument().layers[0]!
    const pencil = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000000099',
      tool: 'pencil', start: { x: 10, y: 10 }, end: { x: 30, y: 30 },
    })!
    for (const layers of [[arrow, pencil], [pencil, arrow]]) {
      const app = mount({ ...arrowDocument(), layers })
      app.store.selectTool('select')
      app.store.selectLayer(layers[0]!.id)
      app.store.selectLayer(layers[1]!.id, true)
      await nextTick()
      const toolbar = app.view.container.querySelector('.cs-selection-floating-toolbar') as HTMLElement
      expect(toolbar.querySelector('.cs-arrow-formatting-toolbar')).toBeNull()
      expect(toolbar.querySelector('[data-tool-settings]')).toBeNull()
      expect(toolbar.querySelector('input[aria-label="Width"]')).toBeInTheDocument()
      app.close()
    }
  })
  it('does not reset source analysis on annotation, undo, crop or zoom changes', async () => {
    const reset = vi.spyOn(HighlighterBackgroundController.prototype, 'reset')
    const app = mount()
    await nextTick()
    reset.mockClear()
    await fireEvent.click(screen.getByRole('button', { name: 'Highlighter' }))
    await draw(app.scene)
    app.session.undo()
    app.session.redo()
    app.session.execute({ type: 'setCrop', before: null, after: { x: 0, y: 0, width: 60, height: 60 } })
    app.store.setZoom(150)
    await nextTick()
    expect(reset).not.toHaveBeenCalled()
    app.close()
  })
  it('changes a highlighter group atomically and keeps automatic creation defaults after style edits', async () => {
    const first = createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000010', tool: 'marker', start: { x: 5, y: 20 }, end: { x: 60, y: 20 } })!
    const second = { ...first, id: '019c1f62-058e-7000-8000-000000000011', blendMode: 'screen' as const }
    const app = mount({ ...arrowDocument(), layers: [first, second] })
    app.store.selectTool('select')
    app.store.selectLayer(first.id)
    app.store.selectLayer(second.id, true)
    await nextTick()
    const execute = vi.spyOn(app.session, 'execute')
    const toolbar = app.view.container.querySelector('.cs-selection-floating-toolbar') as HTMLElement
    await fireEvent.click(await within(toolbar).findByRole('button', { name: 'Effect' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Tint' }))
    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute.mock.calls[0]![0].type).toBe('batch')
    expect(app.session.snapshot.core.document.layers.map((layer) => 'blendMode' in layer ? layer.blendMode : null)).toEqual(['normal', 'normal'])
    app.session.undo()
    expect(app.session.snapshot.core.document.layers.map((layer) => 'blendMode' in layer ? layer.blendMode : null)).toEqual(['multiply', 'screen'])
    app.session.redo()
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Highlighter' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Effect' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Auto' }))
    await draw(app.scene)
    expect(app.session.snapshot.core.document.layers.at(-1)).toMatchObject({ payload: { highlighterMode: 'auto' } })
    app.close()
  })
  it.each(['click', 'keyboard', 'configure'] as const)('cancels palette sampling on an explicit tool %s, including the same tool', async (method) => {
    const app = mount()
    const arrow = screen.getByRole('button', { name: 'Arrow' })
    await fireEvent.contextMenu(arrow)
    await fireEvent.click(screen.getByRole('button', { name: 'Color' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Custom colour' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Sample colour from canvas' }))
    expect(app.scene).toHaveClass('cs-canvas-eyedropper-cursor')
    expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeNull()
    const before = app.session.snapshot.core.document
    if (method === 'click') await fireEvent.click(arrow)
    else if (method === 'configure') await fireEvent.contextMenu(arrow)
    else await fireEvent.keyDown(window, { key: 'a', code: 'KeyA' })
    await nextTick()
    expect(app.scene).not.toHaveClass('cs-canvas-eyedropper-cursor')
    expect(app.session.snapshot.core.document).toEqual(before)
    await draw(app.scene)
    expect(app.session.snapshot.core.document.layers.map((layer) => layer.kind)).toEqual(['arrow'])
    app.close()
  })
  it('keeps the defaults target after hiding configure controls for canvas sampling', async () => {
    const context = Object.assign(canvasContext(), {
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([51, 102, 153, 255]) })),
    })
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(context)
    const app = mount(arrowDocument())
    const original = app.session.snapshot.core.document.layers[0]
    const arrow = screen.getByRole('button', { name: 'Arrow' })
    await fireEvent.contextMenu(arrow)
    await fireEvent.click(screen.getByRole('button', { name: 'Color' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Custom colour' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Sample colour from canvas' }))
    await fireEvent.pointerDown(app.scene, { button: 0, pointerId: 1, clientX: 30, clientY: 30 })
    await fireEvent.pointerUp(app.scene, { button: 0, pointerId: 1, clientX: 30, clientY: 30 })
    expect(app.scene).not.toHaveClass('cs-canvas-eyedropper-cursor')
    expect(app.session.snapshot.core.document.layers[0]).toEqual(original)
    await draw(app.scene)
    const created = app.session.snapshot.core.document.layers.at(-1)!
    if (created.kind !== 'arrow') throw new Error('Expected a new arrow after sampling')
    expect(created.payload.stroke.color).toEqual({ red: 0.2, green: 0.4, blue: 0.6, alpha: 1 })
    app.close()
  })
  it('restores defaults configured before any object was created from v3 preferences alone', async () => {
    const app = mount()
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Arrow' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Stroke: 3 px' }))
    await fireEvent.click(screen.getByRole('button', { name: '8 px' }))
    await nextTick()
    const preferences = localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)!
    app.close()
    localStorage.clear()
    localStorage.setItem(TOOL_SETTINGS_STORAGE_KEY, preferences)
    const reopened = mount()
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Arrow' }))
    expect(screen.getByRole('button', { name: 'Stroke: 8 px' })).toBeTruthy()
    reopened.close()
  })
  it('keeps the first selection drag alive when the initial tool is implicit Select', async () => {
    const shape = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000000010',
      tool: 'shape', start: { x: 10, y: 10 }, end: { x: 50, y: 50 },
    })!
    if (shape.kind !== 'shape') throw new Error('expected shape')
    const filled = { ...shape, payload: { ...shape.payload, fill: { kind: 'solid' as const, opacity: 1, color: { red: 1, green: 0, blue: 0, alpha: 1 } } } }
    const app = mount({ ...arrowDocument(), layers: [filled] })
    await draw(app.scene)
    expect(app.session.snapshot.core.document.layers[0]!.transform.translateX)
      .toBeGreaterThan(shape.transform.translateX)
    app.close()
  })
  it('addresses texture import to tool defaults despite an existing selection', async () => {
    const shape = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000000010',
      tool: 'shape', start: { x: 10, y: 10 }, end: { x: 40, y: 40 },
    })!
    const app = mount({ ...arrowDocument(), layers: [shape] })
    const imported = {
      kind: 'imported' as const, blobHash: 'a'.repeat(64), format: 'png' as const,
      mimeType: 'image/png' as const, width: 32, height: 32, resourceToken: 'texture-test',
    }
    vi.spyOn(TextureResourceResolver.prototype, 'import').mockResolvedValue(imported)
    vi.spyOn(TextureResourceResolver.prototype, 'get').mockReturnValue({ kind: 'ready', image: new Image() })
    await app.view.rerender({ textureBridge: {
      importTexture: vi.fn(), resolveTexture: vi.fn(), stageImage: vi.fn(), readImageBytes: vi.fn(),
    } })
    app.store.selectLayer(shape.id)
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Shape' }))
    const popover = app.view.container.querySelector('.cs-tool-defaults-toolbar') as HTMLElement
    await fireEvent.click(within(popover).getByRole('button', { name: /Fill:/ }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Import texture' }))
    await nextTick()
    expect(shapePayload(app.session.snapshot.core.document.layers[0]!).fill).toEqual(shapePayload(shape).fill)
    await fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
    await fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
    await draw(app.scene)
    expect(shapePayload(app.session.snapshot.core.document.layers.at(-1)!).fill).toMatchObject({
      kind: 'imageTexture', blobHash: imported.blobHash,
    })
    app.close()
  })
  it.each(['Arrow', 'Shape', 'Hide data', 'Spotlight', 'Ruler', 'Loupe'])(
    '%s selects its successfully created instance',
    async (label) => {
      const app = mount()
      await fireEvent.click(screen.getByRole('button', { name: label }))
      await draw(app.scene)
      expect(app.session.snapshot.core.document.layers).toHaveLength(1)
      expect(app.store.activeToolId).toBe('select')
      expect(app.store.selectedLayerId).toBe(app.session.snapshot.core.document.layers[0]!.id)
      expect(app.view.container.querySelector('.cs-selection-floating-toolbar')).toBeTruthy()
      expect(app.view.container.querySelector('.cs-bottom-chrome-center > .cs-context-toolbar')).toBeNull()
      app.session.undo()
      expect(app.session.snapshot.core.document.layers).toHaveLength(0)
      app.session.redo()
      expect(app.session.snapshot.core.document.layers).toHaveLength(1)
      app.close()
    },
  )
  it.each(['Pencil', 'Highlighter', 'Numbered marker'])(
    '%s remains active without selecting the new instance in Quick Capture',
    async (label) => {
      const app = mount(undefined, true)
      await fireEvent.click(screen.getByRole('button', { name: label }))
      await draw(app.scene)
      expect(app.session.snapshot.core.document.layers).toHaveLength(1)
      expect(app.store.activeToolId).not.toBe('select')
      expect(app.store.selectedLayerIds).toEqual([])
      app.close()
    },
  )
  it('activates and configures defaults without changing an existing selected object', async () => {
    const app = mount(arrowDocument())
    app.store.selectTool('select')
    app.store.selectLayer(app.session.snapshot.core.document.layers[0]!.id)
    const before = app.session.snapshot.core.document
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Arrow' }))
    expect(app.store.activeToolId).toBe('arrow')
    const host = app.view.container.querySelector('.cs-tool-defaults-toolbar') as HTMLElement
    const stroke = within(host).getByRole('button', { name: 'Stroke: 3 px' })
    await fireEvent.pointerDown(stroke.querySelector('path')!)
    expect(app.view.container.querySelector('.cs-tool-defaults-toolbar')).toBeTruthy()
    await fireEvent.click(stroke)
    await fireEvent.click(await screen.findByRole('button', { name: '6 px' }))
    expect(app.session.snapshot.core.document).toEqual(before)
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Arrow' }))
    expect(app.view.container.querySelector('.cs-tool-defaults-toolbar')).toBeTruthy()
    expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeNull()
    await draw(app.scene)
    expect(app.session.snapshot.core.document.layers.at(-1)).toMatchObject({
      payload: { stroke: { width: 6 } },
    })
    app.close()
  })
  it('uses physical shortcuts in Russian and leaves text input alone', async () => {
    const app = mount()
    await fireEvent.keyDown(window, { key: 'ф', code: 'KeyA' })
    expect(app.store.activeToolId).toBe('arrow')
    await fireEvent.keyDown(window, { key: 'и', code: 'KeyB' })
    expect(app.store.activeToolId).toBe('censor')
    const input = document.createElement('textarea')
    document.body.append(input)
    await fireEvent.keyDown(input, { key: 'а', code: 'KeyF' })
    expect(app.store.activeToolId).toBe('censor')
    input.remove()
    app.close()
  })
  it('applies one mixed-selection property as one command and remembers it after remount', async () => {
    const first = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000000010',
      tool: 'shape',
      start: { x: 10, y: 10 },
      end: { x: 30, y: 30 },
    })!
    if (first.kind !== 'shape') throw new Error('expected shape')
    const second = {
      ...first,
      id: '019c1f62-058e-7000-8000-000000000011',
      payload: { ...first.payload, cornerRadius: 8 },
    }
    const app = mount({ ...arrowDocument(), layers: [first, second] })
    app.store.selectTool('select')
    app.store.selectLayer(first.id)
    app.store.selectLayer(second.id, true)
    await nextTick()
    const spy = vi.spyOn(app.session, 'execute')
    const toolbar = app.view.container.querySelector('.cs-selection-floating-toolbar') as HTMLElement
    await fireEvent.click(await within(toolbar).findByRole('button', { name: /Stroke:/ }))
    await fireEvent.click(await screen.findByRole('button', { name: '8 px' }))
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0]![0].type).toBe('batch')
    expect(app.session.snapshot.core.document.layers.map((layer) => layer.kind === 'shape' ? layer.payload.cornerRadius : null)).toEqual([0, 8])
    const current = shapePayload(app.session.snapshot.core.document.layers[0]!).stroke
    app.session.undo()
    expect(shapePayload(app.session.snapshot.core.document.layers[0]!).stroke).not.toEqual(current)
    app.session.redo()
    expect(shapePayload(app.session.snapshot.core.document.layers[0]!).stroke).toEqual(current)
    await nextTick()
    expect(localStorage.getItem(TOOL_SETTINGS_STORAGE_KEY)).toBeTruthy()
    app.close()
    const reopened = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
    await draw(reopened.scene)
    expect(shapePayload(reopened.session.snapshot.core.document.layers[0]!).stroke).toEqual(current)
    reopened.close()
  })
  it.each([false, true])('edits a created shape with independent fill, one-command history and cancel (quick=%s)', async (quickMode) => {
    const app = mount(undefined, quickMode)
    await fireEvent.click(screen.getByRole('button', { name: 'Shape' }))
    await draw(app.scene)
    expect(app.store.activeToolId).toBe('select')
    const before = app.session.snapshot.core.document.layers.at(-1)!
    const toolbar = app.view.container.querySelector('.cs-selection-floating-toolbar') as HTMLElement
    await fireEvent.click(await within(toolbar).findByRole('button', { name: /Fill:/ }))
    const spy = vi.spyOn(app.session, 'execute')
    await fireEvent.click(await screen.findByRole('button', { name: 'Custom colour' }))
    await fireEvent.change(await screen.findByRole('textbox', { name: 'HEX colour code' }), { target: { value: '#336699' } })
    expect(spy).toHaveBeenCalledTimes(1)
    const after = app.session.snapshot.core.document.layers.at(-1)!
    expect(shapePayload(after).stroke).toEqual(shapePayload(before).stroke)
    expect(after.transform).toEqual(before.transform)
    expect(shapePayload(after).fill).toMatchObject({ kind: 'solid', opacity: 1 })
    app.session.undo()
    expect(shapePayload(app.session.snapshot.core.document.layers.at(-1)!).fill).toEqual(shapePayload(before).fill)
    app.session.redo()
    expect(shapePayload(app.session.snapshot.core.document.layers.at(-1)!).fill).toEqual(shapePayload(after).fill)
    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'HEX colour code' }), { key: 'Escape' })
    await fireEvent.click(await within(toolbar).findByRole('button', { name: /Shape:/ }))
    const radius = await screen.findByRole('spinbutton', { name: 'Corner radius' })
    const count = spy.mock.calls.length
    await fireEvent.input(radius, { target: { value: '17' } })
    await fireEvent.keyDown(radius, { key: 'Escape' })
    expect(spy).toHaveBeenCalledTimes(count)
    expect(app.store.activeToolId).toBe('select')
    app.close()
  })
  it('opens an object menu, preserves multi-selection and duplicates/deletes atomically', async () => {
    const document = arrowDocument()
    const first = document.layers[0]!
    const app = mount({
      ...document,
      layers: [
        first,
        {
          ...first,
          id: '019c1f62-058e-7000-8000-000000000011',
          transform: { ...first.transform, translateY: 50 },
        },
      ],
    })
    app.store.selectTool('select')
    app.store.selectLayer(first.id)
    app.store.selectLayer(app.session.snapshot.core.document.layers[1]!.id, true)
    const spy = vi.spyOn(app.session, 'execute')
    await fireEvent.contextMenu(app.scene, { clientX: 48, clientY: 16 })
    expect(app.store.selectedLayerIds).toHaveLength(2)
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }))
    expect(app.session.snapshot.core.document.layers).toHaveLength(4)
    expect(spy.mock.calls[0]![0].type).toBe('batch')
    await fireEvent.keyDown(window, { key: 'Delete' })
    expect(app.session.snapshot.core.document.layers).toHaveLength(2)
    app.session.undo()
    expect(app.session.snapshot.core.document.layers).toHaveLength(4)
    app.close()
  })
  it('explains disabled ordering and unavailable empty-canvas commands', async () => {
    const app = mount(arrowDocument())
    app.store.selectTool('select')
    app.store.selectLayer(app.session.snapshot.core.document.layers[0]!.id)
    await fireEvent.contextMenu(app.scene, { clientX: 48, clientY: 16 })
    const forward = screen.getByRole('menuitem', { name: 'Bring forward' })
    expect(forward).toBeDisabled()
    expect(forward).toHaveAttribute('title', 'Already at the edge of the layer stack')
    await fireEvent.keyDown(forward, { key: 'Escape' })
    await fireEvent.contextMenu(app.scene, { clientX: 180, clientY: 120 })
    const undo = screen.getByRole('menuitem', { name: 'Undo' })
    expect(undo).toBeDisabled()
    expect(undo).toHaveAttribute('title', 'No action to undo')
    expect(screen.getByRole('menuitem', { name: 'Paste' })).toHaveAttribute('title', 'Clipboard is unavailable')
    app.close()
  })
  it('uses physical Russian keys for mounted history and duplicate commands', async () => {
    const app = mount(arrowDocument())
    const layer = app.session.snapshot.core.document.layers[0]!
    app.store.selectTool('select')
    app.store.selectLayer(layer.id)
    app.session.execute({ type: 'removeLayer', layer, index: 0 })

    await fireEvent.keyDown(window, { code: 'KeyZ', key: 'я', ctrlKey: true })
    expect(app.session.snapshot.core.document.layers).toHaveLength(1)
    await fireEvent.keyDown(window, { code: 'KeyZ', key: 'Я', ctrlKey: true, shiftKey: true })
    expect(app.session.snapshot.core.document.layers).toHaveLength(0)
    await fireEvent.keyDown(window, { code: 'KeyZ', key: 'я', ctrlKey: true })
    app.store.selectLayer(layer.id)
    await fireEvent.keyDown(window, { code: 'KeyD', key: 'в', ctrlKey: true })
    expect(app.session.snapshot.core.document.layers).toHaveLength(2)
    app.close()
  })
  it('commits text once, keeps text/callout/number defaults independent and cancels drafts', async () => {
    const app = mount()
    const rail = within(app.view.container.querySelector<HTMLElement>('.cs-toolrail')!)
    const fontSize = () => within(app.view.container.querySelector<HTMLElement>('.cs-tool-configure-popover-host .cs-text-toolbar, .cs-tool-defaults-toolbar .cs-numbered-marker-toolbar')!)
      .getByRole('button', { name: 'Font size' })
    await fireEvent.click(rail.getByRole('button', { name: 'Text' }))
    await draw(app.scene)
    const editor = screen.getByRole('textbox', { name: 'Text editor' })
    const toolbar = app.view.container.querySelector('.cs-text-floating-toolbar-host') as HTMLElement
    await fireEvent.click(within(toolbar).getByRole('button', { name: 'Font size' }))
    const sizes = await screen.findByRole('dialog', { name: 'Font size' })
    await fireEvent.click(within(sizes).getByRole('button', { name: '32 px' }))
    editor.textContent = 'Hello 😀'
    await fireEvent.input(editor)
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(app.store.activeToolId).toBe('select')
    expect(app.session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'text',
      payload: { content: { text: 'Hello 😀', spans: [{ fontSize: 32 }] } },
    })
    await fireEvent.contextMenu(rail.getByRole('button', { name: 'Callout' }))
    expect(app.view.container.querySelector('.cs-tool-configure-popover-host .cs-callout-toolbar')?.textContent).toContain('24')
    await fireEvent.contextMenu(rail.getByRole('button', { name: 'Numbered marker' }))
    expect(fontSize()).toHaveTextContent('16')
    await fireEvent.contextMenu(rail.getByRole('button', { name: 'Text' }))
    expect(fontSize()).toHaveTextContent('32')
    await draw(app.scene, 95)
    const cancelled = screen.getByRole('textbox', { name: 'Text editor' })
    cancelled.textContent = 'Cancelled'
    await fireEvent.input(cancelled)
    await fireEvent.keyDown(cancelled, { key: 'Escape' })
    expect(app.session.snapshot.core.document.layers).toHaveLength(1)
    expect(app.store.activeToolId).toBe('select')
    app.close()
  })
  it('copies style between document mounts and disables an entire locked group', async () => {
    const source = mount(arrowDocument())
    source.store.selectTool('select')
    source.store.selectLayer(source.session.snapshot.core.document.layers[0]!.id)
    await fireEvent.keyDown(window, { code: 'KeyC', key: 'с', ctrlKey: true, altKey: true })
    source.close()
    const doc = arrowDocument()
    const arrow = doc.layers[0]!
    if (arrow.kind !== 'arrow') throw new Error('expected arrow')
    const recipient = { ...arrow, payload: { ...arrow.payload, stroke: { ...arrow.payload.stroke, width: 8 } } }
    const target = mount({ ...doc, layers: [recipient] })
    target.store.selectTool('select')
    target.store.selectLayer(recipient.id)
    await fireEvent.keyDown(window, { code: 'KeyV', key: 'м', ctrlKey: true, altKey: true })
    expect(target.session.snapshot.core.document.layers[0]).toMatchObject({
      id: recipient.id,
      payload: { stroke: { width: 3 } },
    })
    target.session.undo()
    expect(target.session.snapshot.core.document.layers[0]).toMatchObject({ payload: { stroke: { width: 8 } } })
    target.session.execute({ type: 'updateLayer', before: recipient, after: { ...recipient, locked: true } })
    const before = target.session.snapshot.core.document
    await fireEvent.keyDown(window, { code: 'KeyV', key: 'м', ctrlKey: true, altKey: true })
    expect(target.session.snapshot.core.document).toEqual(before)
    target.close()
  })
})
