import { fireEvent } from '@testing-library/vue'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  document,
  mountViewport,
} from './canvas-viewport-test-kit'
import { DEFAULT_DRAWING_DEFAULTS } from '@cute-screen/editor-renderer'
import { CanvasGeometryController } from '../../../packages/editor-vue/src/shell/canvas/geometry-controller'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    measureText: (text: string) => ({ width: Array.from(text).length * 14.4 }),
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

describe('M05 CanvasViewport transforms', () => {
  it('freezes automatic highlighter resolution at pointerdown while later strokes use the ready result', async () => {
    const view = mountViewport('marker')
    await view.rerender({ drawingDefaults: DEFAULT_DRAWING_DEFAULTS, highlighterEffect: 'highlight' })
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 5, clientY: 50 })
    await view.rerender({ highlighterEffect: 'illuminate' })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 75, clientY: 50 })
    await fireEvent.pointerUp(view.scene, { pointerId: 1, clientX: 75, clientY: 50 })
    const first = view.emitted('addLayer') as unknown as readonly (readonly unknown[])[]
    expect(first[0]?.[0]).toMatchObject({ blendMode: 'multiply', payload: { highlighterMode: 'auto' } })
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 2, clientX: 5, clientY: 70 })
    await fireEvent.pointerMove(view.scene, { pointerId: 2, clientX: 75, clientY: 70 })
    await fireEvent.pointerUp(view.scene, { pointerId: 2, clientX: 75, clientY: 70 })
    const second = view.emitted('addLayer') as unknown as readonly (readonly unknown[])[]
    expect(second[1]?.[0]).toMatchObject({ blendMode: 'screen', payload: { highlighterMode: 'auto' } })
  })
  it('commits Shift-constrained rotation from an outer corner zone', async () => {
    const { scene, emitted } = mountViewport()

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 41,
      clientY: 41,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: -1,
      clientY: 41,
      shiftKey: true,
    })
    expect(emitted().transformLayer).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: -1, clientY: 41 })

    expect(emitted().transformLayer).toEqual([['shape', expect.objectContaining({
      rotation: 90,
      translateX: 30,
      translateY: 10,
    })]])
  })

  it('does not rotate from the removed detached top handle position', async () => {
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
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 42, clientY: 20 })

    expect(emitted().transformLayer).toBeUndefined()
  })

  it('previews rotation about the fixed center and leaves cancellation and clicks without a command', async () => {
    const geometry = new CanvasGeometryController({
      props: { document } as ConstructorParameters<typeof CanvasGeometryController>[0]['props'],
      gesture: () => ({
        kind: 'rotate', id: 'shape', center: { x: 20, y: 20 }, startAngle: 0,
        initial: document.layers[0]!.transform, currentAngle: 90,
      }),
    })
    expect(geometry.gesturePreviewLayer()?.transform).toMatchObject({
      rotation: 90, translateX: 30, translateY: 10,
    })
    const { scene, emitted } = mountViewport()
    await fireEvent.pointerDown(scene, { pointerId: 1, clientX: 41, clientY: 41 })
    await fireEvent.pointerMove(scene, { pointerId: 1, clientX: -1, clientY: 41 })
    await fireEvent.pointerCancel(scene, { pointerId: 1 })
    expect(emitted().transformLayer).toBeUndefined()
    await fireEvent.pointerDown(scene, { pointerId: 2, clientX: 41, clientY: 41 })
    await fireEvent.pointerUp(scene, { pointerId: 2, clientX: 41, clientY: 41 })
    expect(emitted().transformLayer).toBeUndefined()
    expect(document.layers[0]!.transform).toMatchObject({ rotation: 0, translateX: 10, translateY: 10 })
  })

  it('uses direct hover cursors for intrinsic resize and corner rotation zones', async () => {
    const { scene } = mountViewport()

    await fireEvent.pointerMove(scene, { clientX: 30, clientY: 30 })
    expect(scene.style.cursor).toBe('nwse-resize')

    await fireEvent.pointerMove(scene, { clientX: 41, clientY: 41 })
    expect(scene.classList).toContain('cs-canvas-rotate-cursor')

    await fireEvent.pointerMove(scene, { clientX: 20, clientY: 20 })
    expect(scene.style.cursor).toBe('move')
    expect(scene.classList).not.toContain('cs-canvas-rotate-cursor')
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

    const addLayer = emitted().addLayer as unknown as readonly [unknown][] | undefined
    expect(addLayer).toHaveLength(2)
    expect(addLayer?.[0]?.[0]).toMatchObject({
      kind: 'arrow',
      blendMode: 'normal',
    })
    vi.unstubAllGlobals()
  })

  it.each(['marker', 'arrow', 'shape'] as const)('does not commit a cancelled %s drawing draft', async (tool) => {
    const { scene, emitted } = mountViewport(tool)
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
    const scroll = container.querySelector('.cs-canvas-scroll') as HTMLDivElement
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

    expect(emitted().addLayer).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 30, clientY: 40 })

    const addLayer = emitted().addLayer as unknown as readonly [unknown][] | undefined
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
      x: layer!.transform.translateX + layer!.localBounds.x + layer!.localBounds.width / 2,
      y: layer!.transform.translateY + layer!.localBounds.y + layer!.localBounds.height / 2,
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
    expect(emitted().textEditing).toEqual([[expect.objectContaining({ kind: 'text' })]])
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
})
