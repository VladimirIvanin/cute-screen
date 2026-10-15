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
  type EditorDocumentV1,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import { TOOL_SETTINGS_STORAGE_KEY } from '../../../packages/editor-vue/src/shell/workspace/tool-settings-memory'
import { TextureResourceResolver } from '../../../packages/editor-vue/src/texture-fill'

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
    const popover = app.view.container.querySelector('.cs-tool-configure-popover-host') as HTMLElement
    await fireEvent.click(within(popover).getByRole('button', { name: 'More' }))
    await fireEvent.click(within(popover).getByRole('button', { name: 'Import texture' }))
    await nextTick()
    expect(shapePayload(app.session.snapshot.core.document.layers[0]!).fill).toEqual(shapePayload(shape).fill)
    await fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })
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
  it.each(['Pencil', 'Marker', 'Numbered marker'])(
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
    const host = app.view.container.querySelector('.cs-tool-configure-popover-host') as HTMLElement
    const stroke = within(host).getByRole('button', { name: 'Stroke: 3 px' })
    await fireEvent.pointerDown(stroke.querySelector('path')!)
    expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeTruthy()
    await fireEvent.click(stroke)
    await fireEvent.click(await screen.findByRole('button', { name: '6 px' }))
    expect(app.session.snapshot.core.document).toEqual(before)
    await fireEvent.contextMenu(screen.getByRole('button', { name: 'Arrow' }))
    expect(app.view.container.querySelector('.cs-tool-configure-popover-host')).toBeTruthy()
    await fireEvent.keyDown(host, { key: 'Escape' })
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
    const width = await within(toolbar).findByRole('slider', { name: 'Width' })
    width.focus()
    await fireEvent.keyDown(width, { key: 'ArrowRight' })
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
    await fireEvent.contextMenu(app.scene, { clientX: 40, clientY: 20 })
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
  it('commits text once, keeps text/callout/number defaults independent and cancels drafts', async () => {
    const app = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    await draw(app.scene)
    const editor = screen.getByRole('textbox', { name: 'Text editor' })
    const toolbar = app.view.container.querySelector('.cs-text-floating-toolbar-host') as HTMLElement
    await fireEvent.click(within(toolbar).getByRole('button', { name: 'Font size' }))
    await fireEvent.click(screen.getByRole('button', { name: '32' }))
    editor.textContent = 'Hello 😀'
    await fireEvent.input(editor)
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(app.store.activeToolId).toBe('select')
    expect(app.session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'text',
      payload: { content: { text: 'Hello 😀', spans: [{ fontSize: 32 }] } },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Callout' }))
    expect(screen.getByRole('button', { name: 'Font size' })).toHaveTextContent('24')
    await fireEvent.click(screen.getByRole('button', { name: 'Numbered marker' }))
    expect(screen.getByRole('button', { name: 'Font size' })).toHaveTextContent('16')
    await fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    expect(screen.getByRole('button', { name: 'Font size' })).toHaveTextContent('32')
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
    await fireEvent.keyDown(window, { code: 'KeyC', key: 'c', ctrlKey: true, altKey: true })
    source.close()
    const doc = arrowDocument()
    const arrow = doc.layers[0]!
    if (arrow.kind !== 'arrow') throw new Error('expected arrow')
    const recipient = { ...arrow, payload: { ...arrow.payload, stroke: { ...arrow.payload.stroke, width: 8 } } }
    const target = mount({ ...doc, layers: [recipient] })
    target.store.selectTool('select')
    target.store.selectLayer(recipient.id)
    await fireEvent.keyDown(window, { code: 'KeyV', key: 'v', ctrlKey: true, altKey: true })
    expect(target.session.snapshot.core.document.layers[0]).toMatchObject({
      id: recipient.id,
      payload: { stroke: { width: 3 } },
    })
    target.session.undo()
    expect(target.session.snapshot.core.document.layers[0]).toMatchObject({ payload: { stroke: { width: 8 } } })
    target.session.execute({ type: 'updateLayer', before: recipient, after: { ...recipient, locked: true } })
    const before = target.session.snapshot.core.document
    await fireEvent.keyDown(window, { code: 'KeyV', key: 'v', ctrlKey: true, altKey: true })
    expect(target.session.snapshot.core.document).toEqual(before)
    target.close()
  })
})
