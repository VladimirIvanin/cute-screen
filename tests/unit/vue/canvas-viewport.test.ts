import { fireEvent, render } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import {
  rebaseArrowLayer,
  type ArrowLayer,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import type { TextToolDefaults } from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'

const document: EditorDocumentV1 = {
  schemaVersion: 7,
  id: '019c1f62-058e-7000-8000-000000000000',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 100,
    height: 100,
    orientationApplied: true,
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 100, height: 100 },
  crop: null,
  layers: [
    {
      id: 'shape',
      kind: 'shape',
      localBounds: { x: 0, y: 0, width: 20, height: 20 },
      transform: {
        translateX: 10,
        translateY: 10,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      opacity: 1,
      blendMode: 'normal',
      shadows: [],
      visible: true,
      locked: false,
      payload: {},
    },
  ],
  presentation: {
    beautify: { enabled: false },
    watermark: { enabled: false },
  },
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

function mountViewport(
  activeTool?: string,
  viewportDocument: EditorDocumentV1 = document,
  selectedLayerId = 'shape',
  textDefaults?: TextToolDefaults,
  sampling = false,
) {
  const rendered = render(CanvasViewport, {
    props: {
      documentState: { kind: 'ready', title: 'Test', dimensions: '100 × 100' },
      canvas: viewportDocument.canvas,
      document: viewportDocument,
      selectedLayerId,
      activeTool,
      sampling,
      ...(textDefaults === undefined ? {} : { textDefaults }),
      zoom: 100,
      fitMode: true,
      t: (key) => key,
    },
  })
  const scene = rendered.getByLabelText('sceneCanvas') as HTMLCanvasElement
  Object.defineProperty(scene, 'width', { configurable: true, value: 100 })
  Object.defineProperty(scene, 'height', { configurable: true, value: 100 })
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    top: 0,
    right: 100,
    bottom: 100,
    left: 0,
    toJSON: () => ({}),
  })
  scene.setPointerCapture = vi.fn()
  scene.hasPointerCapture = vi.fn(() => false)
  return { ...rendered, scene }
}

describe('M05 CanvasViewport transforms', () => {
  it('samples one opaque scene pixel without reading the interaction overlay', async () => {
    const { scene, emitted } = mountViewport(
      undefined,
      document,
      'shape',
      undefined,
      true,
    )
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([18, 52, 86, 255]),
    }))
    vi.spyOn(scene, 'getContext').mockReturnValue({
      getImageData,
    } as unknown as CanvasRenderingContext2D)

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 25,
      clientY: 30,
    })

    expect(getImageData).toHaveBeenCalledWith(25, 30, 1, 1)
    expect(emitted().colorSample).toEqual([['#123456']])
    expect(emitted().addLayer).toBeUndefined()
  })

  it('keeps sampling available after a transparent scene pixel', async () => {
    const { scene, emitted } = mountViewport(
      undefined,
      document,
      'shape',
      undefined,
      true,
    )
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([18, 52, 86, 0]),
    }))
    vi.spyOn(scene, 'getContext').mockReturnValue({
      getImageData,
    } as unknown as CanvasRenderingContext2D)

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 25,
      clientY: 30,
    })
    await fireEvent.pointerDown(scene, {
      pointerId: 2,
      clientX: 26,
      clientY: 30,
    })

    expect(getImageData).toHaveBeenCalledTimes(2)
    expect(emitted().colorSample).toBeUndefined()
    expect(emitted().colorSampleError).toHaveLength(2)
  })

  it('fits to the usable viewport after subtracting canvas chrome insets', async () => {
    let notify: (() => void) | undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback
        }
        observe(): void {}
        disconnect(): void {}
      },
    )
    const { container, emitted, unmount } = mountViewport()
    const scroll = container.querySelector(
      '.cs-canvas-scroll',
    ) as HTMLDivElement
    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: 848 },
      clientHeight: { configurable: true, value: 648 },
    })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '48px',
      paddingRight: '72px',
      paddingBottom: '92px',
      paddingLeft: '72px',
    } as CSSStyleDeclaration)

    notify?.()
    await Promise.resolve()
    expect(emitted().fitZoom).toEqual([[508]])
    unmount()
    vi.unstubAllGlobals()
  })

  it('fits the committed crop output instead of the full document canvas', async () => {
    let notify: (() => void) | undefined
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          notify = callback
        }
        observe(): void {}
        disconnect(): void {}
      },
    )
    const croppedDocument: EditorDocumentV1 = {
      ...document,
      crop: { x: 20, y: 30, width: 50, height: 25 },
    }
    const { container, emitted, unmount } = mountViewport(
      'select',
      croppedDocument,
    )
    const scroll = container.querySelector(
      '.cs-canvas-scroll',
    ) as HTMLDivElement
    Object.defineProperties(scroll, {
      clientWidth: { configurable: true, value: 848 },
      clientHeight: { configurable: true, value: 648 },
    })
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      paddingTop: '48px',
      paddingRight: '72px',
      paddingBottom: '92px',
      paddingLeft: '72px',
    } as CSSStyleDeclaration)

    notify?.()
    await Promise.resolve()
    expect(emitted().fitZoom).toEqual([[1408]])
    unmount()
    vi.unstubAllGlobals()
  })

  it('keeps the exact zoomed canvas surface separate from its centering stage', () => {
    const { container } = mountViewport()
    const stage = container.querySelector('.cs-canvas-stage')
    const surface = container.querySelector(
      '.cs-canvas-surface',
    ) as HTMLDivElement

    expect(stage).not.toBeNull()
    expect(stage).toContainElement(surface)
    expect(surface.style.width).toBe('100px')
    expect(surface.style.height).toBe('100px')
  })

  it('pans the scroll surface when Hand is active', async () => {
    const { container, scene } = mountViewport('hand')
    const scroll = container.querySelector(
      '.cs-canvas-scroll',
    ) as HTMLDivElement
    scroll.scrollLeft = 50
    scroll.scrollTop = 60

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })

    expect(scroll.scrollLeft).toBe(70)
    expect(scroll.scrollTop).toBe(70)
  })

  it('renders a moved Arrow at its transient position before pointer release', async () => {
    const arrowDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'arrow',
          kind: 'arrow',
          localBounds: { x: 10, y: 10, width: 60, height: 20 },
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
          locked: false,
          payload: {
            path: 'straight',
            start: { x: 10, y: 10 },
            end: { x: 70, y: 30 },
            startCap: 'none',
            endCap: 'none',
            stroke: {
              color: { red: 0.82, green: 0.36, blue: 0.08, alpha: 1 },
              width: 4,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext)
    const context = window.document
      .createElement('canvas')
      .getContext('2d') as CanvasRenderingContext2D
    const { scene, emitted } = mountViewport(undefined, arrowDocument, 'arrow')
    vi.mocked(context.moveTo).mockClear()
    vi.mocked(context.lineTo).mockClear()

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 40,
      clientY: 20,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 50,
      clientY: 30,
    })

    expect(context.moveTo).toHaveBeenCalledWith(20, 20)
    expect(context.lineTo).toHaveBeenCalledWith(80, 40)
    expect(emitted().moveLayer).toBeUndefined()
    expect(getContext).toHaveBeenCalled()
  })

  it('commits one constrained corner resize only on pointer release', async () => {
    const { scene, emitted } = mountViewport()

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 30,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 50,
      clientY: 50,
    })
    expect(emitted().transformLayer).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 50, clientY: 50 })

    expect(emitted().transformLayer).toEqual([
      [
        'shape',
        expect.objectContaining({
          translateX: 10,
          translateY: 10,
          scaleX: 2,
          scaleY: 2,
        }),
      ],
    ])
  })

  it('commits Shift-constrained rotation only on pointer release', async () => {
    const { scene, emitted } = mountViewport()

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 20,
      clientY: -12,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 42,
      clientY: 20,
      shiftKey: true,
    })
    expect(emitted().transformLayer).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 42, clientY: 20 })

    expect(emitted().transformLayer).toEqual([
      ['shape', expect.objectContaining({ rotation: 90 })],
    ])
  })

  it('keeps drawing drafts transient and commits each pointer create once', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000099'),
    })
    const { scene, emitted } = mountViewport('arrow')

    await fireEvent.pointerDown(scene, { pointerId: 1, clientX: 5, clientY: 5 })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 25,
      clientY: 5,
    })
    expect(emitted().addLayer).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 25, clientY: 5 })
    await fireEvent.pointerDown(scene, {
      pointerId: 2,
      clientX: 5,
      clientY: 10,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 2,
      clientX: 25,
      clientY: 10,
    })
    await fireEvent.pointerUp(scene, { pointerId: 2, clientX: 25, clientY: 10 })

    const addLayer = emitted().addLayer as unknown as
      readonly [unknown][] | undefined
    expect(addLayer).toHaveLength(2)
    expect(addLayer?.[0]?.[0]).toMatchObject({
      kind: 'arrow',
      blendMode: 'normal',
    })
    vi.unstubAllGlobals()
  })

  it('does not commit a cancelled drawing draft', async () => {
    const { scene, emitted } = mountViewport('marker')
    await fireEvent.pointerDown(scene, { pointerId: 1, clientX: 5, clientY: 5 })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 25,
      clientY: 5,
    })
    await fireEvent.pointerCancel(scene, { pointerId: 1 })

    expect(emitted().addLayer).toBeUndefined()
  })

  it('routes an Image-tool click to one native import request at the visible canvas centre', async () => {
    const { container, scene, emitted } = mountViewport('image')
    const scroll = container.querySelector(
      '.cs-canvas-scroll',
    ) as HTMLDivElement
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      top: 0,
      right: 100,
      bottom: 100,
      left: 0,
      toJSON: () => ({}),
    })

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 15,
      clientY: 20,
    })

    expect(emitted().requestImageImport).toEqual([[{ x: 50, y: 50 }]])
    expect(emitted().addLayer).toBeUndefined()
  })

  it('creates a numbered marker with the pointer click at its centre', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000099'),
    })
    const { scene, emitted } = mountViewport('numberedMarker')

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })

    const addLayer = emitted().addLayer as unknown as
      readonly [unknown][] | undefined
    const layer = (addLayer?.[0]?.[0] ?? null) as {
      readonly transform: {
        readonly translateX: number
        readonly translateY: number
      }
      readonly localBounds: {
        readonly x: number
        readonly y: number
        readonly width: number
        readonly height: number
      }
    } | null
    expect(layer).not.toBeNull()
    expect({
      x:
        layer!.transform.translateX +
        layer!.localBounds.x +
        layer!.localBounds.width / 2,
      y:
        layer!.transform.translateY +
        layer!.localBounds.y +
        layer!.localBounds.height / 2,
    }).toEqual({ x: 30, y: 40 })
    vi.unstubAllGlobals()
  })

  it('commits click-created text as auto-sized content in one command', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000099'),
    })
    const { getByLabelText, scene, emitted } = mountViewport('text')

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })
    const editor = getByLabelText('Text editor') as HTMLDivElement
    expect(emitted().textEditing).toEqual([
      [expect.objectContaining({ kind: 'text' })],
    ])
    editor.textContent = 'Click text'
    await fireEvent.input(editor)
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(emitted().documentCommand).toEqual([
      [
        expect.objectContaining({
          type: 'addLayer',
          layer: expect.objectContaining({
            kind: 'text',
            payload: expect.objectContaining({
              content: expect.objectContaining({ wrap: 'autoSize' }),
            }),
          }),
        }),
      ],
    ])
    expect(emitted().textEditing?.at(-1)).toEqual([undefined])
    vi.unstubAllGlobals()
  })

  it('commits entered text when the canvas is clicked', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000100'),
    })
    const { getByLabelText, scene, emitted } = mountViewport('text')

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })
    const editor = getByLabelText('Text editor') as HTMLDivElement
    editor.textContent = 'Click to commit'
    await fireEvent.input(editor)

    await fireEvent.pointerDown(scene, {
      pointerId: 2,
      clientX: 70,
      clientY: 80,
    })

    expect(emitted().documentCommand).toEqual([
      [
        expect.objectContaining({
          type: 'addLayer',
          layer: expect.objectContaining({
            kind: 'text',
            payload: expect.objectContaining({
              content: expect.objectContaining({ text: 'Click to commit' }),
            }),
          }),
        }),
      ],
    ])
    expect(() => getByLabelText('Text editor')).toThrow()
    vi.unstubAllGlobals()
  })

  it('uses a contenteditable editor, accepts plain-text paste and commits on blur', async () => {
    const { getByLabelText, scene, emitted } = mountViewport('text')
    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })
    const editor = getByLabelText('Text editor') as HTMLDivElement
    expect(editor).toHaveAttribute('contenteditable', 'true')
    expect(editor.tagName).toBe('DIV')
    await fireEvent.paste(editor, {
      clipboardData: { getData: () => 'Plain\ntext' },
    })
    await fireEvent.blur(editor)
    await vi.waitFor(() => expect(emitted().documentCommand).toHaveLength(1))
  })

  it('shows the selected portable text background in the DOM editor overlay', async () => {
    const background = {
      color: { red: 1, green: 0.8, blue: 0.2, alpha: 1 },
      padding: 6,
      radius: 4,
    }
    const { getByLabelText, scene } = mountViewport('text', document, 'shape', {
      fontFamily: 'Roboto',
      fontSize: 24,
      weight: 400,
      italic: false,
      strikethrough: false,
      alignment: 'start',
      listKind: 'none',
      color: { red: 0, green: 0, blue: 0, alpha: 1 },
      background,
    })

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })

    const editor = getByLabelText('Text editor') as HTMLDivElement
    expect(editor.style.backgroundColor).toBe('rgb(255, 204, 51)')
    expect(editor.style.borderRadius).toBe('4px')
  })

  it('uses the horizontal drag span as a fixed text width before opening the editor', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000099'),
    })
    const { getByLabelText, scene, emitted } = mountViewport('text')

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 30,
    })
    expect(() => getByLabelText('Text editor')).toThrow()
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 80,
      clientY: 45,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 80, clientY: 45 })
    const editor = getByLabelText('Text editor') as HTMLDivElement
    editor.textContent = 'Fixed width'
    await fireEvent.input(editor)
    await fireEvent.keyDown(editor, { key: 'Enter', ctrlKey: true })

    expect(emitted().documentCommand).toEqual([
      [
        expect.objectContaining({
          type: 'addLayer',
          layer: expect.objectContaining({
            localBounds: expect.objectContaining({ width: 60 }),
            payload: expect.objectContaining({
              content: expect.objectContaining({
                wrap: 'fixedWidth',
                fixedWidth: 60,
              }),
            }),
          }),
        }),
      ],
    ])
    vi.unstubAllGlobals()
  })

  it('returns to Select on Escape after an already-cancelled drawing draft', async () => {
    const { emitted } = mountViewport('shape')
    await fireEvent.keyDown(window, { key: 'Escape' })

    expect(emitted().selectTool).toEqual([['select']])
  })

  it('commits one arrow anchor payload update on handle release', async () => {
    const arrowDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'arrow',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 20, height: 10 },
          transform: {
            translateX: 10,
            translateY: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          blendMode: 'normal',
          shadows: [],
          visible: true,
          locked: false,
          payload: {
            path: 'straight',
            start: { x: 0, y: 0 },
            end: { x: 20, y: 10 },
            startCap: 'none',
            endCap: 'solidArrow',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const { scene, emitted } = mountViewport(undefined, arrowDocument, 'arrow')
    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 15,
      clientY: 15,
    })
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 15, clientY: 15 })

    const updates = emitted().documentCommand as unknown as
      | readonly [
          {
            readonly type: 'updateLayer'
            readonly after: EditorDocumentV1['layers'][number]
          },
        ][]
      | undefined
    expect(updates).toHaveLength(1)
    const after = updates?.[0]?.[0].after
    expect(updates?.[0]?.[0]).toMatchObject({
      type: 'updateLayer',
      before: { id: 'arrow' },
      after: { id: 'arrow', kind: 'arrow' },
    })
    if (!after) throw new Error('expected updated arrow layer')
    const afterPayload = after.payload as unknown as {
      readonly start: { readonly x: number; readonly y: number }
      readonly end: { readonly x: number; readonly y: number }
    }
    expect(after.transform.translateX + afterPayload.start.x).toBe(15)
    expect(after.transform.translateY + afterPayload.start.y).toBe(15)
    expect(after.transform.translateX + afterPayload.end.x).toBe(30)
    expect(after.transform.translateY + afterPayload.end.y).toBe(20)
    expect(emitted().updateLayerPayload).toBeUndefined()
  })

  it('commits one rebased elbow middle-segment update on pointer release', async () => {
    const elbowDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'elbow',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 100, height: 100 },
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
          locked: false,
          payload: {
            path: 'elbow',
            start: { x: 10, y: 10 },
            end: { x: 90, y: 90 },
            elbow: { axis: 'y', offset: -10 },
            startCap: 'none',
            endCap: 'diamond',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 3,
              style: 'dashed',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const { scene, emitted } = mountViewport(undefined, elbowDocument, 'elbow')
    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 40,
      clientY: 50,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 60,
      clientY: 50,
    })
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 60, clientY: 50 })

    const commands = emitted().documentCommand as unknown as
      readonly [unknown][] | undefined
    const command = commands?.[0]?.[0] as
      | {
          readonly type: string
          readonly after: EditorDocumentV1['layers'][number]
        }
      | undefined
    expect(commands).toHaveLength(1)
    expect(command?.type).toBe('updateLayer')
    const afterPayload = command!.after.payload as unknown as {
      readonly start: { readonly x: number }
      readonly end: { readonly x: number }
      readonly elbow: { readonly offset: number }
    }
    expect(
      command!.after.transform.translateX +
        (afterPayload.start.x + afterPayload.end.x) / 2 +
        afterPayload.elbow.offset,
    ).toBe(60)
  })

  it('keeps a quadratic bend transient and commits it once on release', async () => {
    const quadraticDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'quadratic',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 40, height: 30 },
          transform: {
            translateX: 10,
            translateY: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          blendMode: 'normal',
          shadows: [],
          visible: true,
          locked: false,
          payload: {
            path: 'quadratic',
            start: { x: 0, y: 0 },
            end: { x: 20, y: 10 },
            bend: { x: 10, y: 0 },
            startCap: 'none',
            endCap: 'solidArrow',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const { scene, emitted } = mountViewport(
      undefined,
      quadraticDocument,
      'quadratic',
    )
    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 10,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 0,
    })
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 20, clientY: 0 })

    const commands = emitted().documentCommand as unknown as
      readonly [unknown][] | undefined
    expect(commands).toHaveLength(1)
    expect(commands?.[0]?.[0]).toMatchObject({
      type: 'updateLayer',
      before: { id: 'quadratic' },
      after: { id: 'quadratic', payload: { path: 'quadratic' } },
    })
  })

  it('draws the selection bounds expanded for a rebased 10 px Arrow cap', async () => {
    const before: ArrowLayer = {
      id: 'wide-cap',
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 60, height: 20 },
      transform: {
        translateX: 10,
        translateY: 10,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      opacity: 1,
      blendMode: 'normal',
      shadows: [],
      visible: true,
      locked: false,
      payload: {
        path: 'straight',
        start: { x: 0, y: 0 },
        end: { x: 60, y: 20 },
        startCap: 'none',
        endCap: 'solidArrow',
        stroke: {
          color: { red: 1, green: 0, blue: 0, alpha: 1 },
          width: 3,
          style: 'solid',
          cap: 'round',
          join: 'round',
        },
      },
    }
    const after = rebaseArrowLayer(before, {
      ...before.payload,
      stroke: { ...before.payload.stroke, width: 10 },
    })
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext)
    const context = window.document
      .createElement('canvas')
      .getContext('2d') as CanvasRenderingContext2D
    getContext.mockClear()
    vi.mocked(context.strokeRect).mockClear()
    mountViewport(undefined, { ...document, layers: [after] }, 'wide-cap')

    await vi.waitFor(() => {
      expect(context.strokeRect).toHaveBeenCalledWith(0, 0, 120, 80)
    })
  })
})
