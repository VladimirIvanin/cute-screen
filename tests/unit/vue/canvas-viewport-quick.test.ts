import { fireEvent } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'
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
  it('signals regular editor readiness after its document frame renders', async () => {
    const { emitted } = mountViewport()

    await vi.waitFor(() =>
      expect(emitted().frameReady).toEqual([[document.id]]),
    )
  })

  it('signals quick-mode readiness only after the document frame renders', async () => {
    const { emitted } = mountViewport(
      undefined,
      document,
      'shape',
      undefined,
      false,
      undefined,
      undefined,
      true,
    )

    await vi.waitFor(() =>
      expect(emitted().frameReady).toEqual([[document.id]]),
    )
  })

  it('creates the first Quick crop on the same mounted canvas interaction surface', async () => {
    const { scene, emitted, rerender, getByLabelText } = mountViewport(
      'select',
      document,
      '',
      undefined,
      false,
      undefined,
      undefined,
      true,
      true,
    )

    await fireEvent.pointerDown(scene, {
      pointerId: 8,
      button: 0,
      clientX: 20,
      clientY: 30,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 8,
      clientX: 70,
      clientY: 80,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 8,
      clientX: 70,
      clientY: 80,
    })

    expect(emitted().documentCommand).toEqual([
      [
        {
          type: 'setCrop',
          before: null,
          after: { x: 20, y: 30, width: 50, height: 50 },
        },
      ],
    ])
    expect(emitted().quickSelectionComplete).toEqual([
      [{ x: 20, y: 30, width: 50, height: 50 }],
    ])

    await rerender({
      quickSelectionMode: false,
      document: {
        ...document,
        crop: { x: 20, y: 30, width: 50, height: 50 },
      },
    })
    expect(getByLabelText('sceneCanvas')).toBe(scene)
  })

  it('keeps Quick selection active after a click without an area', async () => {
    const { scene, emitted } = mountViewport(
      'select',
      document,
      '',
      undefined,
      false,
      undefined,
      undefined,
      true,
      true,
    )

    await fireEvent.pointerDown(scene, {
      pointerId: 9,
      button: 0,
      clientX: 20,
      clientY: 30,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 9,
      clientX: 20,
      clientY: 30,
    })

    expect(emitted().documentCommand).toBeUndefined()
    expect(emitted().quickSelectionComplete).toBeUndefined()
  })

  it('streams quick-frame geometry and commits one crop command on release', async () => {
    const croppedDocument: EditorDocumentV1 = {
      ...document,
      crop: { x: 10, y: 10, width: 60, height: 60 },
    }
    const { scene, emitted } = mountViewport(
      'select',
      croppedDocument,
      'shape',
      undefined,
      false,
      undefined,
      undefined,
      true,
    )

    await fireEvent.pointerDown(scene, {
      pointerId: 7,
      button: 0,
      clientX: 70,
      clientY: 70,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 7,
      clientX: 80,
      clientY: 75,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 7,
      clientX: 80,
      clientY: 75,
    })

    expect(emitted().quickFrameChange).toEqual([
      [{ x: 10, y: 10, width: 70, height: 65 }],
    ])
    expect(emitted().documentCommand).toEqual([
      [
        {
          type: 'setCrop',
          before: { x: 10, y: 10, width: 60, height: 60 },
          after: { x: 10, y: 10, width: 70, height: 65 },
        },
      ],
    ])
  })

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
})
