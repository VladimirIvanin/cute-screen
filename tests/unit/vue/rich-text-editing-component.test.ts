import { fireEvent, render } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CanvasViewport, {
  type TextFormattingPatch,
  type TextToolDefaults,
} from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import type { RenderSceneSnapshot } from '@cute-screen/editor-core'
import {
  Canvas2DRenderer,
  createCalloutLayer,
  createNumberedMarkerLayer,
  createTextLayer,
  type EditorDocument,
  type ImageLayer,
  type LayerNode,
} from '@cute-screen/editor-renderer'

const TEXT_DEFAULTS: TextToolDefaults = Object.freeze({
  fontFamily: 'Roboto',
  fontSize: 24,
  weight: 400,
  italic: false,
  strikethrough: false,
  alignment: 'start',
  listKind: 'none',
  color: { red: 0, green: 0, blue: 0, alpha: 1 },
  background: null,
})

function editorDocument(layer?: LayerNode): EditorDocument {
  return {
    schemaVersion: 7,
    id: '019c1f62-058e-7000-8000-000000000000',
    source: {
      blobHash: 'a'.repeat(64),
      format: 'png',
      mimeType: 'image/png',
      width: 240,
      height: 160,
      orientationApplied: true,
      provenance: 'capture',
      color: { colorSpace: 'srgb', hasIccProfile: false },
    },
    canvas: { width: 240, height: 160 },
    crop: null,
    layers: layer ? [layer] : [],
    presentation: {
      beautify: { enabled: false },
      watermark: { enabled: false },
    },
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

function mount(
  layer?: LayerNode,
  activeTool = 'select',
  renderPersistedScene = false,
) {
  const imageLayer: ImageLayer = {
    id: '019c1f62-058e-7000-8000-000000000001',
    kind: 'image',
    localBounds: { x: 0, y: 0, width: 240, height: 160 },
    transform: {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
    opacity: 1,
    blendMode: 'normal',
    shadows: [],
    visible: true,
    locked: true,
    payload: {
      blobHash: 'a'.repeat(64),
      intrinsicWidth: 240,
      intrinsicHeight: 160,
      format: 'png',
      orientationApplied: true,
      color: { colorSpace: 'srgb', hasIccProfile: false },
      role: 'base',
      border: null,
      radius: 0,
      crop: null,
      mask: null,
    },
  }
  const document = editorDocument(layer)
  const renderDocument = renderPersistedScene
    ? { ...document, layers: layer ? [imageLayer, layer] : [imageLayer] }
    : document
  const image = new Image()
  if (renderPersistedScene) {
    Object.defineProperties(image, {
      naturalWidth: { configurable: true, value: 240 },
      naturalHeight: { configurable: true, value: 160 },
    })
    image.src = 'data:image/png;base64,'
  }
  const rendered = render(CanvasViewport, {
    props: {
      documentState: { kind: 'ready', title: 'Text', dimensions: '240 × 160' },
      canvas: renderDocument.canvas,
      document: renderDocument,
      ...(renderPersistedScene ? { image, imageLayer } : {}),
      activeTool,
      textDefaults: TEXT_DEFAULTS,
      zoom: 100,
      fitMode: true,
      t: (key) => key,
    },
  })
  const scene = rendered.getByLabelText('sceneCanvas') as HTMLCanvasElement
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 240,
    height: 160,
    top: 0,
    right: 240,
    bottom: 160,
    left: 0,
    toJSON: () => ({}),
  })
  scene.setPointerCapture = vi.fn()
  scene.hasPointerCapture = vi.fn(() => false)
  return { ...rendered, scene }
}

async function openExistingEditor(
  layer: LayerNode,
): Promise<ReturnType<typeof mount>> {
  const rendered = mount(layer)
  await fireEvent.dblClick(rendered.scene, {
    clientX: layer.transform.translateX + 2,
    clientY: layer.transform.translateY + 2,
  })
  return rendered
}

function selectWithinFirstSpan(
  editor: HTMLDivElement,
  start: number,
  end: number,
): void {
  const text = editor.querySelector('[data-rich-text-span]')?.firstChild
  if (!(text instanceof Text)) throw new Error('expected projected text span')
  const selection = window.getSelection()
  const range = document.createRange()
  range.setStart(text, start)
  range.setEnd(text, end)
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.dispatchEvent(new Event('selectionchange'))
}

function firstCommand(
  emitted: (event?: string) => Record<string, unknown[][]>,
) {
  return emitted().documentCommand?.[0]?.[0] as
    | {
        readonly type: string
        readonly before?: LayerNode
        readonly after?: LayerNode
        readonly layer?: LayerNode
      }
    | undefined
}

describe('v7 rich-text component editing', () => {
  it('formats the selected emoji range and explicitly commits one update command', async () => {
    const layer = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000101',
      text: 'A😀B',
      origin: { x: 10, y: 10 },
    })!
    const rendered = await openExistingEditor(layer)
    const editor = rendered.getByLabelText('Text editor') as HTMLDivElement
    selectWithinFirstSpan(editor, 1, 3)

    await rendered.rerender({
      textFormatting: {
        revision: 1,
        span: { italic: true, weight: 700 },
      } satisfies TextFormattingPatch,
    })
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await vi.waitFor(() =>
      expect(rendered.emitted().documentCommand).toHaveLength(1),
    )

    const command = firstCommand(rendered.emitted)
    expect(command?.type).toBe('updateLayer')
    expect(command?.after?.kind).toBe('text')
    if (command?.after?.kind !== 'text') throw new Error('expected text update')
    expect(command.after.payload.content.spans).toEqual([
      expect.objectContaining({ start: 0, end: 1, italic: false, weight: 400 }),
      expect.objectContaining({ start: 1, end: 3, italic: true, weight: 700 }),
      expect.objectContaining({ start: 3, end: 4, italic: false, weight: 400 }),
    ])
  })

  it('uses a collapsed-caret toolbar change as the style for later input', async () => {
    const layer = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000106',
      text: 'AB',
      origin: { x: 10, y: 10 },
    })!
    const rendered = await openExistingEditor(layer)
    const editor = rendered.getByLabelText('Text editor') as HTMLDivElement
    selectWithinFirstSpan(editor, 1, 1)

    await rendered.rerender({
      textFormatting: {
        revision: 1,
        span: { weight: 700, strikethrough: true },
      } satisfies TextFormattingPatch,
    })
    await fireEvent.paste(editor, {
      clipboardData: { getData: () => 'x' },
    })
    await fireEvent.blur(editor)
    await vi.waitFor(() =>
      expect(rendered.emitted().documentCommand).toHaveLength(1),
    )

    const command = firstCommand(rendered.emitted)
    if (command?.after?.kind !== 'text') throw new Error('expected text update')
    expect(command.after.payload.content.spans).toEqual([
      expect.objectContaining({ start: 0, end: 1, weight: 400 }),
      expect.objectContaining({
        start: 1,
        end: 2,
        weight: 700,
        strikethrough: true,
      }),
      expect.objectContaining({ start: 2, end: 3, weight: 400 }),
    ])
  })

  it('summarizes the current selection and patches only the requested span field', async () => {
    const layer = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000107',
      text: 'abcd',
      origin: { x: 10, y: 10 },
      fontFamily: 'Georgia',
      fontSize: 48,
      color: { red: 0.86, green: 0.08, blue: 0.24, alpha: 1 },
      italic: true,
      alignment: 'center',
      listKind: 'bullet',
    })!
    const rendered = await openExistingEditor(layer)
    const editor = rendered.getByLabelText('Text editor') as HTMLDivElement
    selectWithinFirstSpan(editor, 1, 3)

    const emitted = rendered.emitted() as Record<string, unknown[][]>
    const draft = emitted.textEditing?.at(-1)?.[0] as
      { readonly snapshot: Record<string, unknown> } | undefined
    expect(draft?.snapshot).toMatchObject({
      fontFamily: 'Georgia',
      fontSize: 48,
      color: { red: 0.86, green: 0.08, blue: 0.24, alpha: 1 },
      italic: true,
      alignment: 'center',
      listKind: 'bullet',
    })

    await rendered.rerender({
      textFormatting: {
        revision: 1,
        span: { weight: 700 },
      } satisfies TextFormattingPatch,
    })
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await vi.waitFor(() =>
      expect(rendered.emitted().documentCommand).toHaveLength(1),
    )

    const command = firstCommand(rendered.emitted)
    if (command?.after?.kind !== 'text') throw new Error('expected text update')
    expect(command.after.payload.content.spans).toEqual([
      expect.objectContaining({
        start: 0,
        end: 1,
        fontFamily: 'Georgia',
        fontSize: 48,
        color: { red: 0.86, green: 0.08, blue: 0.24, alpha: 1 },
        weight: 400,
        italic: true,
      }),
      expect.objectContaining({
        start: 1,
        end: 3,
        fontFamily: 'Georgia',
        fontSize: 48,
        color: { red: 0.86, green: 0.08, blue: 0.24, alpha: 1 },
        weight: 700,
        italic: true,
      }),
      expect.objectContaining({
        start: 3,
        end: 4,
        fontFamily: 'Georgia',
        fontSize: 48,
        color: { red: 0.86, green: 0.08, blue: 0.24, alpha: 1 },
        weight: 400,
        italic: true,
      }),
    ])
    expect(command.after.payload.content.paragraphs).toEqual([
      { start: 0, end: 4, alignment: 'center', listKind: 'bullet' },
    ])
  })

  it.each(['callout', 'numberedMarker'] as const)(
    'commits the editable background for a %s without extra commands',
    async (kind) => {
      const id = `019c1f62-058e-7000-8000-00000000020${kind.length}`
      const layer =
        kind === 'callout'
          ? createCalloutLayer({
              id,
              text: 'old',
              origin: { x: 10, y: 10 },
              tailAnchor: { x: 20, y: 60 },
            })!
          : createNumberedMarkerLayer({
              id,
              sequence: 1,
              origin: { x: 10, y: 10 },
            })
      const rendered = await openExistingEditor(layer)
      await rendered.rerender({
        textFormatting: {
          revision: 1,
          background: {
            color: { red: 0.12, green: 0.34, blue: 0.56, alpha: 1 },
            padding: 12,
            radius: 18,
          },
        } satisfies TextFormattingPatch,
      })
      const editor = rendered.getByRole('textbox') as HTMLDivElement
      await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
      await vi.waitFor(() =>
        expect(rendered.emitted().documentCommand).toHaveLength(1),
      )
      const command = firstCommand(rendered.emitted)
      if (kind === 'callout') {
        expect(command?.after).toMatchObject({
          kind,
          payload: { bubble: { padding: 12, radius: 18 } },
        })
      } else {
        expect(command?.after).toMatchObject({
          kind,
          payload: { badge: { color: { red: 0.12, green: 0.34, blue: 0.56 } } },
        })
      }
    },
  )

  it('defers IME input until compositionend and commits the session once', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000102'),
    })
    const rendered = mount(undefined, 'text')
    await fireEvent.pointerDown(rendered.scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    await fireEvent.pointerUp(rendered.scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 20,
    })
    const editor = rendered.getByLabelText('Text editor') as HTMLDivElement

    await fireEvent.compositionStart(editor)
    editor.textContent = 'に'
    await fireEvent.input(editor)
    editor.textContent = '日本😀'
    await fireEvent.input(editor)
    expect(rendered.emitted().documentCommand).toBeUndefined()

    await fireEvent.compositionEnd(editor)
    expect(rendered.emitted().documentCommand).toBeUndefined()
    await fireEvent.blur(editor)
    await vi.waitFor(() =>
      expect(rendered.emitted().documentCommand).toHaveLength(1),
    )
    const command = firstCommand(rendered.emitted)
    expect(command?.layer?.kind).toBe('text')
    if (command?.layer?.kind !== 'text') throw new Error('expected text add')
    expect(command.layer.payload.content.text).toBe('日本😀')
    expect(command.layer.payload.content.spans.at(-1)?.end).toBe(4)
    vi.unstubAllGlobals()
  })

  it('continues a bullet, exits an empty bullet, and persists no bullet glyph', async () => {
    const layer = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000103',
      text: 'item',
      origin: { x: 10, y: 10 },
      listKind: 'bullet',
    })!
    const rendered = await openExistingEditor(layer)
    const editor = rendered.getByLabelText('Text editor') as HTMLDivElement

    await fireEvent.keyDown(editor, { key: 'Enter' })
    await fireEvent.keyDown(editor, { key: 'Enter' })
    await fireEvent.blur(editor)
    await vi.waitFor(() =>
      expect(rendered.emitted().documentCommand).toHaveLength(1),
    )

    const command = firstCommand(rendered.emitted)
    if (command?.after?.kind !== 'text') throw new Error('expected text update')
    expect(command.after.payload.content.text).toBe('item\n')
    expect(command.after.payload.content.text).not.toContain('•')
    expect(command.after.payload.content.paragraphs).toEqual([
      { start: 0, end: 5, alignment: 'start', listKind: 'bullet' },
      { start: 5, end: 5, alignment: 'start', listKind: 'none' },
    ])
  })

  it('copies and pastes only text/plain inside the editing projection', async () => {
    const layer = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000104',
      text: 'A😀B',
      origin: { x: 10, y: 10 },
    })!
    const rendered = await openExistingEditor(layer)
    const editor = rendered.getByLabelText('Text editor') as HTMLDivElement
    selectWithinFirstSpan(editor, 1, 3)
    const writes: Array<readonly [string, string]> = []

    await fireEvent.copy(editor, {
      clipboardData: {
        clearData: vi.fn(),
        setData: (type: string, value: string) => writes.push([type, value]),
      },
    })
    expect(writes).toEqual([['text/plain', '😀']])

    await fireEvent.paste(editor, {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain' ? 'plain\r\n<b>text</b>' : '<b>ignored</b>',
      },
    })
    await fireEvent.blur(editor)
    await vi.waitFor(() =>
      expect(rendered.emitted().documentCommand).toHaveLength(1),
    )
    const command = firstCommand(rendered.emitted)
    if (command?.after?.kind !== 'text') throw new Error('expected text update')
    expect(command.after.payload.content.text).toBe('Aplain\n<b>text</b>B')
  })

  it('rolls the whole session back on Escape with a typed cancellation outcome', async () => {
    const layer = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000105',
      text: 'unchanged',
      origin: { x: 10, y: 10 },
    })!
    const rendered = await openExistingEditor(layer)
    const editor = rendered.getByLabelText('Text editor') as HTMLDivElement
    await fireEvent.paste(editor, {
      clipboardData: { getData: () => 'draft' },
    })
    await fireEvent.keyDown(editor, { key: 'Escape' })

    expect(rendered.emitted().documentCommand).toBeUndefined()
    expect(rendered.emitted().textEditingCancelled).toEqual([['escape']])
  })

  it.each(['text', 'callout', 'numberedMarker'] as const)(
    'uses one shared update command for a %s editing session',
    async (kind) => {
      const id = `019c1f62-058e-7000-8000-00000000010${kind.length}`
      const layer =
        kind === 'text'
          ? createTextLayer({ id, text: 'old', origin: { x: 10, y: 10 } })!
          : kind === 'callout'
            ? createCalloutLayer({
                id,
                text: 'old',
                origin: { x: 10, y: 10 },
                tailAnchor: { x: 20, y: 60 },
              })!
            : createNumberedMarkerLayer({
                id,
                sequence: 1,
                origin: { x: 10, y: 10 },
              })
      const rendered = await openExistingEditor(layer)
      const editor = rendered.getByRole('textbox') as HTMLDivElement
      selectWithinFirstSpan(editor, 0, layer.kind === 'numberedMarker' ? 1 : 3)
      await fireEvent.paste(editor, {
        clipboardData: { getData: () => 'new' },
      })
      await fireEvent.blur(editor)
      await vi.waitFor(() =>
        expect(rendered.emitted().documentCommand).toHaveLength(1),
      )

      expect(firstCommand(rendered.emitted)).toMatchObject({
        type: 'updateLayer',
        before: { kind },
        after: { kind },
      })
    },
  )

  it('replaces persisted text with one transient projection and restores it on cancel', async () => {
    const layer = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000109',
      text: 'single projection',
      origin: { x: 10, y: 10 },
    })!
    const scenes: RenderSceneSnapshot[] = []
    const setScene = vi
      .spyOn(Canvas2DRenderer.prototype, 'setScene')
      .mockImplementation((scene) => {
        scenes.push(scene)
      })
    const renderScene = vi
      .spyOn(Canvas2DRenderer.prototype, 'render')
      .mockReturnValue({
        backend: 'canvas2d',
        correlationId: 'text-projection-test',
        reasons: ['scene'],
        nodeCount: 0,
        startedAt: 0,
        duration: 0,
      })

    try {
      const rendered = mount(layer, 'select', true)
      await vi.waitFor(() =>
        expect(scenes.at(-1)?.nodes.some((node) => node.id === layer.id)).toBe(
          true,
        ),
      )

      await fireEvent.dblClick(rendered.scene, {
        clientX: layer.transform.translateX + 2,
        clientY: layer.transform.translateY + 2,
      })
      await expect(
        rendered.findByLabelText('Text editor'),
      ).resolves.toBeTruthy()
      await vi.waitFor(() =>
        expect(scenes.at(-1)?.nodes.some((node) => node.id === layer.id)).toBe(
          false,
        ),
      )

      await fireEvent.keyDown(rendered.getByLabelText('Text editor'), {
        key: 'Escape',
      })
      await vi.waitFor(() =>
        expect(scenes.at(-1)?.nodes.some((node) => node.id === layer.id)).toBe(
          true,
        ),
      )
      expect(rendered.emitted().documentCommand).toBeUndefined()
    } finally {
      setScene.mockRestore()
      renderScene.mockRestore()
    }
  })
})
