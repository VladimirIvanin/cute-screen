import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  CommandManager,
  DEFAULT_DRAWING_DEFAULTS,
  SHAPE_CATALOG,
  createDocumentRenderScene,
  createDrawingLayer,
  type EditorDocumentV1,
  type EditorCommand,
  type ShapeLayer,
} from '@cute-screen/editor-core'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import { NumericPreviewController } from '../../../packages/editor-vue/src/shell/workspace/numeric-preview-controller'
import { canvas2dPngs } from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'
import { compareRgba } from './golden'

describe('numeric preview pixels and decoded export', () => {
  it('matches a committed multi-selection and decoded PNG on a 4K full-catalogue composition', async () => {
    const layers = SHAPE_CATALOG.map((entry, index) => createDrawingLayer({
      id: `019c1f62-058e-7000-8000-${String(index + 1).padStart(12, '0')}`,
      tool: 'shape',
      start: { x: (index % 7) * 520 + 40, y: Math.floor(index / 7) * 400 + 40 },
      end: { x: (index % 7) * 520 + 460, y: Math.floor(index / 7) * 400 + 360 },
      defaults: {
        ...DEFAULT_DRAWING_DEFAULTS,
        shape: {
          ...DEFAULT_DRAWING_DEFAULTS.shape,
          shape: entry.shape,
          cornerRadius: entry.cornerRadius ?? 0,
          fill: { kind: 'solid', color: { red: 0.2, green: 0.5, blue: 0.9, alpha: 1 }, opacity: 0.8 },
        },
      },
    }) as ShapeLayer)
    const manager = new CommandManager({
      ...documentFixture,
      source: { ...documentFixture.source, width: 3840, height: 2160 },
      canvas: { width: 3840, height: 2160 },
      layers,
    })
    let frame: FrameRequestCallback | undefined
    let preview: EditorDocumentV1 | undefined
    const commands = (_id: string, value: string): EditorCommand[] => layers.map((layer) => ({
      type: 'updateLayer', before: layer, after: { ...layer, opacity: Number(value) / 100 },
    }))
    const controller = new NumericPreviewController({
      document: () => manager.snapshot.document,
      readOnly: () => false,
      inlineText: () => false,
      commands,
      inlinePatch: () => undefined,
      showDocument: (next) => {
        preview = next
      },
      showText: () => {
        throw new Error('Unexpected text preview')
      },
      requestFrame: (callback) => {
        frame = callback
        return 1
      },
      cancelFrame: () => {
        frame = undefined
      },
    })
    const before = manager.snapshot
    const owner = Symbol()
    controller.preview(owner, { id: 'layerOpacity' }, '50')
    controller.preview(owner, { id: 'layerOpacity' }, '37')
    frame?.(0)
    expect(manager.snapshot).toEqual(before)
    if (!preview) throw new Error('Numeric preview was not projected')
    const projected = await canvas2dPngs(createDocumentRenderScene(preview), 1)
    controller.cancel(owner)
    manager.execute({ type: 'batch', commands: commands('layerOpacity', '37') })
    const committed = await canvas2dPngs(createDocumentRenderScene(manager.snapshot.document), 1)
    const pixels = await rgba(projected.preview)
    expect(pixels.length).toBe(3840 * 2160 * 4)
    expect(compareRgba(pixels, await rgba(committed.preview))).toEqual({ changedChannels: 0, maximumDelta: 0 })
    expect(compareRgba(pixels, await rgba(committed.exported))).toEqual({ changedChannels: 0, maximumDelta: 0 })
    manager.undo()
    expect(manager.snapshot.document).toEqual(before.document)
    expect(manager.snapshot.canUndo).toBe(false)
  }, 30000)
})
