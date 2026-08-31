import { fireEvent } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorDocumentV1, LayerNode } from '@cute-screen/editor-renderer'
import { document, mountViewport } from './canvas-viewport-test-kit'

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

  it('shows grab feedback for Hand and grabbing only during its pan gesture', async () => {
    const { scene } = mountViewport('hand')

    expect(scene.style.cursor).toBe('grab')

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      button: 0,
      clientX: 50,
      clientY: 50,
    })
    expect(scene.style.cursor).toBe('grabbing')

    await fireEvent.pointerUp(scene, {
      pointerId: 1,
      button: 0,
      clientX: 50,
      clientY: 50,
    })
    expect(scene.style.cursor).toBe('grab')

    await fireEvent.pointerDown(scene, {
      pointerId: 2,
      button: 0,
      clientX: 50,
      clientY: 50,
    })
    await fireEvent.pointerCancel(scene, { pointerId: 2 })
    expect(scene.style.cursor).toBe('grab')
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

  it('commits one intrinsic shape resize without transform scale on release', async () => {
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
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 50, clientY: 50 })

    expect(emitted().transformLayer).toBeUndefined()
    expect(emitted().toolError).toBeUndefined()
    expect(emitted().documentCommand).toEqual([
      [
        expect.objectContaining({
          type: 'updateLayer',
          after: expect.objectContaining({
            localBounds: { x: 0, y: 0, width: 40, height: 40 },
            transform: expect.objectContaining({ scaleX: 1, scaleY: 1 }),
          }),
        }),
      ],
    ])
  })

  it('applies Shift aspect lock and Alt centre resize to intrinsic geometry', async () => {
    const { scene, emitted } = mountViewport()

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 30,
      shiftKey: true,
      altKey: true,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 50,
      clientY: 40,
      shiftKey: true,
      altKey: true,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 50, clientY: 40 })

    const command = (
      emitted().documentCommand as unknown[][] | undefined
    )?.[0]?.[0] as { readonly after?: LayerNode } | undefined
    expect(command?.after?.localBounds).toEqual({
      x: -20,
      y: -20,
      width: 60,
      height: 60,
    })
    expect(command?.after?.transform).toMatchObject({ scaleX: 1, scaleY: 1 })
  })

  it('cancels intrinsic resize without committing a command', async () => {
    const { scene, emitted } = mountViewport()

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 30,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 55,
      clientY: 45,
    })
    await fireEvent.pointerCancel(scene, { pointerId: 1 })

    expect(emitted().documentCommand).toBeUndefined()
    expect(emitted().transformLayer).toBeUndefined()
  })

  it('keeps transform resize for image layers', async () => {
    const imageDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'image',
          kind: 'image',
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
          payload: {
            blobHash: 'b'.repeat(64),
            intrinsicWidth: 20,
            intrinsicHeight: 20,
            format: 'png',
            orientationApplied: true,
            color: { colorSpace: 'srgb', hasIccProfile: false },
            role: 'content',
          },
        },
      ],
    }
    const { scene, emitted } = mountViewport(undefined, imageDocument, 'image')

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
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 50, clientY: 50 })

    expect(emitted().transformLayer).toEqual([
      ['image', expect.objectContaining({ scaleX: 2, scaleY: 2 })],
    ])
  })

  it('allows Shift free-resize for image layers', async () => {
    const imageDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'image-free-resize',
          kind: 'image',
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
          payload: {
            blobHash: 'c'.repeat(64),
            intrinsicWidth: 20,
            intrinsicHeight: 20,
            format: 'png',
            orientationApplied: true,
            color: { colorSpace: 'srgb', hasIccProfile: false },
            role: 'content',
          },
        },
      ],
    }
    const { scene, emitted } = mountViewport(
      undefined,
      imageDocument,
      'image-free-resize',
    )

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 30,
      clientY: 30,
      shiftKey: true,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 50,
      clientY: 40,
      shiftKey: true,
    })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 50, clientY: 40 })

    expect(emitted().transformLayer).toEqual([
      [
        'image-free-resize',
        expect.objectContaining({ scaleX: 2, scaleY: 1.5 }),
      ],
    ])
  })
})
