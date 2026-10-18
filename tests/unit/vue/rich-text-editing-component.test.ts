import { mount } from './rich-text-component-test-kit'
import {
  fireEvent,
} from '@testing-library/vue'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import type { TextFormattingPatch } from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import type { RenderSceneSnapshot } from '@cute-screen/editor-core'
import {
  Canvas2DRenderer,
  createCalloutLayer,
  addCalloutStep,
  calloutSelectionHandles,
  createNumberedMarkerLayer,
  createTextLayer,
  type LayerNode,
} from '@cute-screen/editor-renderer'
import { calloutTextLayout } from '@cute-screen/editor-renderer'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: Array.from(text).length * 14.4 }),
    save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    translate: vi.fn(), rotate: vi.fn(), scale: vi.fn(), strokeRect: vi.fn(), fillRect: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    rect: vi.fn(),
    setLineDash: vi.fn(),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

async function openExistingEditor(layer: LayerNode): Promise<ReturnType<typeof mount>> {
  const rendered = mount(layer)
  let clientX = layer.transform.translateX + 2
  let clientY = layer.transform.translateY + 2
  if (layer.kind === 'callout') {
    const layout = calloutTextLayout(layer.payload)
    clientX = layer.transform.translateX + layout.text.x + 2
    clientY = layer.transform.translateY + layout.text.y + 2
  }
  await fireEvent.dblClick(rendered.scene, { clientX, clientY })
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

function firstCommand(emitted: (event?: string) => Record<string, unknown[][]>) {
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
  it('opens an empty callout from the visible line hit margin', async () => {
    const layer = createCalloutLayer({ id: 'empty-edit', text: '', target: { x: 20, y: 120 }, label: { x: 150, y: 40 } })!
    const rendered = mount(layer)
    await fireEvent.dblClick(rendered.scene, { clientX: 24, clientY: 90 })
    await expect(rendered.findByRole('textbox')).resolves.toBeVisible()
    await fireEvent.keyDown(rendered.getByRole('textbox'), { key: 'Escape' })
    expect(rendered.emitted().documentCommand).toBeUndefined()
  })
  it.each(['pointercancel', 'lostpointercapture'])('cancels Alt step deletion on %s', async (type) => {
    const layer = addCalloutStep(createCalloutLayer({ id: 'cancel-step', text: 'Caption',
      target: { x: 20, y: 120 }, label: { x: 150, y: 40 } })!, 0, 25)
    const rendered = mount(layer)
    await rendered.rerender({ selectedLayerId: layer.id, selectedLayerIds: [layer.id] })
    const handle = calloutSelectionHandles(layer).find((item) => item.kind === 'segment:1')!
    const point = { clientX: layer.transform.translateX + handle.point.x,
      clientY: layer.transform.translateY + handle.point.y, button: 0, pointerId: 1, altKey: true }
    await fireEvent.pointerDown(rendered.scene, point)
    await fireEvent(rendered.scene, new MouseEvent(type, { ...point, bubbles: true }))
    await fireEvent.pointerUp(rendered.scene, point)
    expect(rendered.emitted().documentCommand).toBeUndefined()
  })
  it('commits a new callout without text and keeps an existing one after deleting its caption', async () => {
    const created = mount(undefined, 'callout')
    await fireEvent.pointerDown(created.scene, { clientX: 20, clientY: 100, button: 0, pointerId: 1 })
    await fireEvent.pointerMove(created.scene, { clientX: 140, clientY: 40, pointerId: 1 })
    await fireEvent.pointerUp(created.scene, { clientX: 140, clientY: 40, pointerId: 1 })
    const editor = await created.findByRole('textbox')
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    await vi.waitFor(() => expect(created.emitted().documentCommand).toHaveLength(1))
    expect(firstCommand(created.emitted)?.layer).toMatchObject({ kind: 'callout', payload: { content: { text: '', spans: [], paragraphs: [] } } })
    created.unmount()

    const layer = createCalloutLayer({ id: 'caption', text: 'old', target: { x: 20, y: 100 }, label: { x: 140, y: 40 } })!
    const existing = await openExistingEditor(layer)
    const editing = existing.getByRole('textbox') as HTMLDivElement
    selectWithinFirstSpan(editing, 0, 3)
    await fireEvent.cut(editing, { clipboardData: { clearData: vi.fn(), setData: vi.fn() } })
    await fireEvent.keyDown(editing, { key: 'Enter', ctrlKey: true })
    await vi.waitFor(() => expect(existing.emitted().documentCommand).toHaveLength(1))
    expect(firstCommand(existing.emitted)?.after).toMatchObject({ kind: 'callout', payload: { content: { text: '' }, frame: layer.payload.frame } })
  })
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
    await vi.waitFor(() => expect(rendered.emitted().documentCommand).toHaveLength(1))

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
    editor.blur()
    await vi.waitFor(() => expect(rendered.emitted().documentCommand).toHaveLength(1))

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
    const draft = emitted.textEditing?.at(-1)?.[0] as { readonly snapshot: Record<string, unknown> } | undefined
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
    await vi.waitFor(() => expect(rendered.emitted().documentCommand).toHaveLength(1))

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
          ? createCalloutLayer({ style: null,
            id,
            text: 'old',
            target: { x: 10, y: 60 },
            label: { x: 120, y: 20 },
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
      await vi.waitFor(() => expect(rendered.emitted().documentCommand).toHaveLength(1))
      const command = firstCommand(rendered.emitted)
      if (kind === 'callout') {
        expect(command?.after).toMatchObject({
          kind,
          payload: { background: { padding: 12, radius: 18 } },
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
    editor.blur()
    await vi.waitFor(() => expect(rendered.emitted().documentCommand).toHaveLength(1))
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
    editor.blur()
    await vi.waitFor(() => expect(rendered.emitted().documentCommand).toHaveLength(1))

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
        getData: (type: string) => (type === 'text/plain' ? 'plain\r\n<b>text</b>' : '<b>ignored</b>'),
      },
    })
    editor.blur()
    await vi.waitFor(() => expect(rendered.emitted().documentCommand).toHaveLength(1))
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
            ? createCalloutLayer({ style: null,
              id,
              text: 'old',
              target: { x: 10, y: 60 },
              label: { x: 120, y: 20 },
            })!
            : createNumberedMarkerLayer({
                id,
                sequence: 1,
                origin: { x: 10, y: 10 },
              })
      const rendered = await openExistingEditor(layer)
      const editor = rendered.getByRole('textbox') as HTMLDivElement
      if (layer.kind !== 'numberedMarker') selectWithinFirstSpan(editor, 0, 3)
      await fireEvent.paste(editor, {
        clipboardData: { getData: () => 'new' },
      })
      editor.blur()
      await vi.waitFor(() => expect(rendered.emitted().documentCommand).toHaveLength(1))

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
    const setScene = vi.spyOn(Canvas2DRenderer.prototype, 'setScene').mockImplementation((scene) => {
      scenes.push(scene)
    })
    const renderScene = vi.spyOn(Canvas2DRenderer.prototype, 'render').mockReturnValue({
      backend: 'canvas2d',
      correlationId: 'text-projection-test',
      reasons: ['scene'],
      nodeCount: 0,
      startedAt: 0,
      duration: 0,
    })

    try {
      const rendered = mount(layer, 'select', true)
      await vi.waitFor(() => expect(scenes.at(-1)?.nodes.some((node) => node.id === layer.id)).toBe(true))

      await fireEvent.dblClick(rendered.scene, {
        clientX: layer.transform.translateX + 2,
        clientY: layer.transform.translateY + 2,
      })
      await expect(rendered.findByLabelText('Text editor')).resolves.toBeTruthy()
      await vi.waitFor(() => expect(scenes.at(-1)?.nodes.some((node) => node.id === layer.id)).toBe(false))

      await fireEvent.keyDown(rendered.getByLabelText('Text editor'), {
        key: 'Escape',
      })
      await vi.waitFor(() => expect(scenes.at(-1)?.nodes.some((node) => node.id === layer.id)).toBe(true))
      expect(rendered.emitted().documentCommand).toBeUndefined()
    } finally {
      setScene.mockRestore()
      renderScene.mockRestore()
    }
  })
})

describe('measured callout editing', () => {
  it.each([true, false])('grows a new label outside its endpoint and commits once (left=%s)', async (left) => {
    const rendered = mount(undefined, 'callout')
    await fireEvent.pointerDown(rendered.scene, { button: 0, pointerId: 1, clientX: 120, clientY: 60 })
    await fireEvent.pointerMove(rendered.scene, { pointerId: 1, clientX: left ? 80 : 180, clientY: 100 })
    await fireEvent.pointerUp(rendered.scene, { pointerId: 1, clientX: left ? 80 : 180, clientY: 100 })
    const editor = await rendered.findByLabelText('Callout editor') as HTMLDivElement
    await fireEvent.paste(editor, { clipboardData: { getData: () => 'Текст выноски' } })
    const width = Number.parseFloat(editor.style.width)
    expect(width).toBeGreaterThan(24)
    const labelX = left ? 80 : 180
    expect(left ? Number.parseFloat(editor.style.left) + width : Number.parseFloat(editor.style.left))
      .toBeCloseTo(labelX + (left ? -11 : 11))
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })
    expect(rendered.emitted().documentCommand).toHaveLength(1)
    const commands = rendered.emitted('documentCommand') as unknown[][]
    const command = commands[0]![0] as { layer: LayerNode }
    expect(command.layer.kind).toBe('callout')
    if (command.layer.kind !== 'callout') throw new Error('expected callout')
    const layout = calloutTextLayout(command.layer.payload)
    expect(layout.text.width).toBeCloseTo(width)
    expect(command.layer.transform.translateX + layout.text.x).toBeCloseTo(Number.parseFloat(editor.style.left))
  })
  it('remeasures long input, reopens on the label and applies width without emitting intermediate commands', async () => {
    const layer = createCalloutLayer({ style: null, id: 'label', text: 'Текст', target: { x: 180, y: 40 }, label: { x: 160, y: 80 } })!
    const rendered = await openExistingEditor(layer)
    const editor = rendered.getByLabelText('Callout editor') as HTMLDivElement
    const before = calloutTextLayout(layer.payload)
    expect(Number.parseFloat(editor.style.left)).toBeCloseTo(layer.transform.translateX + before.text.x)
    await rendered.rerender({ textFormatting: { revision: 1, calloutWidth: 720 } })
    expect(Number.parseFloat(editor.style.width)).toBe(720)
    expect(rendered.emitted().documentCommand).toBeUndefined()
    await fireEvent.keyDown(editor, { key: 'Escape' })
    expect(rendered.emitted().documentCommand).toBeUndefined()
  })
})

it('does not open the callout editor in a read-only document', async () => {
  const layer = createCalloutLayer({ style: null, id: 'readonly', text: 'Label', target: { x: 40, y: 40 }, label: { x: 80, y: 80 } })!
  const rendered = mount(layer)
  await rendered.rerender({ readOnly: true })
  const rect = calloutTextLayout(layer.payload).text
  await fireEvent.dblClick(rendered.scene, { clientX: layer.transform.translateX + rect.x + 2,
    clientY: layer.transform.translateY + rect.y + 2 })
  expect(rendered.queryByLabelText('Callout editor')).not.toBeInTheDocument()
  expect(rendered.emitted().documentCommand).toBeUndefined()
})
