import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createDrawingLayer,
  type EditorDocumentV1,
  type EditorCommand,
} from '@cute-screen/editor-renderer'
import { NumericPreviewController } from '../../../packages/editor-vue/src/shell/workspace/numeric-preview-controller'
import { documentFixture } from './m08-precision-test-kit'
import { arrowSession } from './app-test-kit'
import { createLayerController } from '../../../packages/editor-vue/src/shell/workspace/layer-controller'
import { shallowRef } from 'vue'

function setup() {
  const layer = createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000888', tool: 'shape', start: { x: 10, y: 10 }, end: { x: 70, y: 60 } })!
  if (layer.kind !== 'shape') throw new Error('Expected shape fixture')
  const session = arrowSession({ ...documentFixture(), layers: [layer] })
  const document = () => session.snapshot.core.document
  let frame: FrameRequestCallback | undefined
  let display: EditorDocumentV1 | undefined
  const showText = vi.fn()
  const commands = (_id: string, value: string): EditorCommand[] => [{ type: 'updateLayer', before: layer, after: { ...layer, opacity: Number(value) / 100 } }]
  const context = {
    document,
    readOnly: () => false,
    inlineText: () => false,
    commands,
    inlinePatch: () => ({ revision: 1, preview: true, span: { fontSize: 32 } }),
    showDocument: (next: EditorDocumentV1 | undefined) => {
      display = next
    },
    showText,
    requestFrame: vi.fn((callback: FrameRequestCallback) => {
      frame = callback
      return 1
    }),
    cancelFrame: vi.fn(() => {
      frame = undefined
    }),
  }
  const controller = new NumericPreviewController(context)
  return { session, context, controller, layer, display: () => display, frame: () => {
    frame?.(0)
    frame = undefined
  } }
}

describe('display-only numeric preview', () => {
  it('previews and commits rotation about the same fixed center, with cancel and undo/redo', () => {
    const app = setup()
    const original = app.session.snapshot.core.document
    const owner = Symbol()
    app.controller.preview(owner, { id: 'rotation', layerId: app.layer.id }, '90')
    app.frame()
    const projected = app.display()!.layers[0]!
    // The 3 px stroke adds 1.5 px on each side; world center is (40, 35).
    expect(projected.transform.translateX).toBeCloseTo(66.5, 10)
    expect(projected.transform.translateY).toBeCloseTo(3.5, 10)
    expect(app.session.snapshot.core.canUndo).toBe(false)
    app.controller.cancel(owner)
    expect(app.display()).toBeUndefined()
    expect(app.session.snapshot.core.document).toEqual(original)
    const controller = createLayerController({
      props: { documentSession: app.session } as Parameters<typeof createLayerController>[0]['props'],
      activeDocument: shallowRef(original),
      store: { selectedLayerIds: [app.layer.id], selectTool: vi.fn(), selectLayer: vi.fn() },
    })
    controller.onLayerRotation(app.layer.id, 90)
    expect(app.session.snapshot.core.document.layers[0]).toEqual(projected)
    app.session.undo()
    expect(app.session.snapshot.core.document.layers).toEqual(original.layers)
    expect(app.session.snapshot.core.canUndo).toBe(false)
    app.session.redo()
    expect(app.session.snapshot.core.document.layers[0]).toEqual(projected)
    app.session.dispose()
  })
  it('coalesces movement without changing document/history/save state, then matches one committed command', () => {
    const app = setup()
    const original = app.session.snapshot
    const owner = Symbol()
    app.controller.preview(owner, { id: 'layerOpacity' }, '60')
    app.controller.preview(owner, { id: 'layerOpacity' }, '37')
    expect(app.context.requestFrame).toHaveBeenCalledTimes(1)
    app.frame()
    expect(app.display()?.layers[0]).toMatchObject({ opacity: 0.37 })
    expect(app.session.snapshot).toEqual(original)
    const preview = app.display()
    app.controller.cancel(owner)
    expect(app.display()).toBeUndefined()
    app.session.execute(app.context.commands('layerOpacity', '37')[0]!)
    expect(app.session.snapshot.core.document.layers).toEqual(preview?.layers)
    app.session.undo()
    expect(app.session.snapshot.core.document.layers).toEqual(original.core.document.layers)
    expect(app.session.snapshot.core.canUndo).toBe(false)
    app.session.dispose()
  })

  it('drops cancelled frames and ignores stale owners and stale base documents', () => {
    const app = setup()
    const owner = Symbol()
    app.controller.preview(owner, { id: 'layerOpacity' }, '25')
    app.controller.cancel(Symbol())
    app.frame()
    expect(app.display()?.layers[0]).toMatchObject({ opacity: 0.25 })
    app.controller.preview(owner, { id: 'layerOpacity' }, '50')
    app.session.execute(app.context.commands('layerOpacity', '75')[0]!)
    app.frame()
    expect(app.display()).toBeUndefined()
    app.controller.preview(owner, { id: 'layerOpacity' }, '50')
    app.controller.cancel(owner)
    app.frame()
    expect(app.display()).toBeUndefined()
    app.session.dispose()
  })

  it('invalidates the active input when its context changes and releases subscriptions', () => {
    const app = setup()
    const owner = Symbol()
    const invalidated = vi.fn()
    const release = app.controller.register(owner, invalidated)
    app.controller.preview(owner, { id: 'layerOpacity' }, '25')
    app.controller.cancel()
    expect(invalidated).toHaveBeenCalledOnce()
    release()
    app.controller.preview(owner, { id: 'layerOpacity' }, '50')
    app.controller.cancel()
    expect(invalidated).toHaveBeenCalledOnce()
    const blocked = new NumericPreviewController({ ...app.context, readOnly: () => true })
    expect(blocked.isBlocked()).toBe(true)
    blocked.preview(owner, { id: 'layerOpacity' }, '25')
    app.frame()
    expect(app.display()).toBeUndefined()
    app.session.dispose()
  })

  it('discards local invalid drafts without a projection and preserves a new owner draft', () => {
    const app = setup()
    const first = Symbol()
    const second = Symbol()
    const resetFirst = vi.fn()
    const resetSecond = vi.fn()
    app.controller.register(first, resetFirst)
    app.controller.register(second, resetSecond)
    app.controller.cancel()
    expect(resetFirst).toHaveBeenCalledOnce()
    expect(resetSecond).toHaveBeenCalledOnce()
    app.controller.preview(first, { id: 'layerOpacity' }, '25')
    expect(resetFirst).toHaveBeenCalledOnce()
    app.controller.preview(second, { id: 'layerOpacity' }, '50')
    expect(resetFirst).toHaveBeenCalledTimes(2)
    expect(resetSecond).toHaveBeenCalledOnce()
    app.frame()
    expect(app.display()?.layers[0]).toMatchObject({ opacity: 0.5 })
    app.session.dispose()
  })

  it('keeps defaults previews away from the selection and restores inline drafts on cancel', () => {
    const app = setup()
    const owner = Symbol()
    app.controller.preview(owner, { id: 'layerOpacity', defaultsTool: 'shape' }, '25')
    app.frame()
    expect(app.display()).toBeUndefined()
    const controller = new NumericPreviewController({ ...app.context, inlineText: () => true })
    controller.preview(owner, { id: 'textFontSize' }, '32')
    app.frame()
    expect(app.context.showText).toHaveBeenLastCalledWith(
      expect.objectContaining({ preview: true, span: { fontSize: 32 } }),
    )
    controller.cancel(owner)
    expect(app.context.showText).toHaveBeenLastCalledWith(expect.objectContaining({ cancelPreview: true }))
    app.session.dispose()
  })
})
