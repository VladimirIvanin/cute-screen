import { fireEvent, render } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import type { EditorDocumentV1 } from '@cute-screen/editor-renderer'

const document: EditorDocumentV1 = {
  schemaVersion: 2,
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
    drawImage: vi.fn(),
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

function mountViewport() {
  const rendered = render(CanvasViewport, {
    props: {
      documentState: { kind: 'ready', title: 'Test', dimensions: '100 × 100' },
      canvas: document.canvas,
      document,
      selectedLayerId: 'shape',
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
})
