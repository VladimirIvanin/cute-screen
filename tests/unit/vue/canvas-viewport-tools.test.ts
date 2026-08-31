import { fireEvent } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountViewport } from './canvas-viewport-test-kit'

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

    expect(emitted().transformLayer).toEqual([
      ['shape', expect.objectContaining({ rotation: 90 })],
    ])
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
})
