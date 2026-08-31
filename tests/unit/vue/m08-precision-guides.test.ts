import { fireEvent, render } from '@testing-library/vue'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDrawingLayer } from '@cute-screen/editor-renderer'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import {
  documentFixture,
  canvasContext,
  contextFixture,
  prepareScene,
  mountViewport,
} from './m08-precision-test-kit'

beforeEach(() => {
  window.localStorage.clear()
  contextFixture.current = canvasContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    contextFixture.current,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('M08 manual precision tools', () => {
  it('renders a frame-coalesced live 9 by 9 eyedropper loupe before confirmation', async () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const view = render(CanvasViewport, {
      props: {
        documentState: { kind: 'ready', title: 'M08', dimensions: '120 × 80' },
        canvas: { width: 120, height: 80 },
        document: documentFixture(),
        sampling: true,
        zoom: 100,
        fitMode: false,
        t: (key: string) => key,
      } as never,
    })
    const scene = view.getByLabelText('sceneCanvas') as HTMLCanvasElement
    prepareScene(scene)
    expect(scene.classList).toContain('cs-canvas-eyedropper-cursor')
    const getImageData = vi.fn(
      (_x: number, _y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4)
        for (let index = 0; index < data.length; index += 4) {
          data.set([171, 205, 239, 255], index)
        }
        return { data, width, height }
      },
    )
    Object.defineProperty(scene, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({ getImageData })),
    })

    await nextTick()
    frames.splice(0).forEach((callback) => callback(0))
    getImageData.mockClear()
    await fireEvent.pointerMove(scene, { clientX: 30, clientY: 20 })
    await fireEvent.pointerMove(scene, { clientX: 31, clientY: 21 })

    expect(getImageData).not.toHaveBeenCalled()
    expect(frames).toHaveLength(1)
    frames.shift()!(16)

    const loupe = view.getByLabelText('eyedropperMagnifier')
    const preview = loupe.querySelector('canvas') as HTMLCanvasElement
    expect(preview).toHaveAttribute('width', '9')
    expect(preview).toHaveAttribute('height', '9')
    expect(loupe).toHaveAttribute('data-state', 'opaque')
    expect(loupe).toHaveTextContent('#ABCDEF')
    expect(loupe).toHaveTextContent('eyedropperClickToSample')
    expect(getImageData).toHaveBeenCalledTimes(1)
    expect(getImageData).toHaveBeenCalledWith(27, 17, 9, 9)
    expect(view.emitted().colorSample).toBeUndefined()

    await fireEvent.pointerMove(scene, { clientX: 31, clientY: 21 })
    frames.shift()!(32)
    expect(getImageData).toHaveBeenCalledTimes(1)
  })

  it('marks a transparent live sample unavailable and keeps the loupe inside the viewport', async () => {
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    const view = render(CanvasViewport, {
      props: {
        documentState: { kind: 'ready', title: 'M08', dimensions: '120 × 80' },
        canvas: { width: 120, height: 80 },
        document: documentFixture(),
        sampling: true,
        zoom: 100,
        fitMode: false,
        t: (key: string) => key,
      } as never,
    })
    const scene = view.getByLabelText('sceneCanvas') as HTMLCanvasElement
    prepareScene(scene, 300, 200)
    Object.defineProperty(scene, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({
        getImageData: (
          _x: number,
          _y: number,
          width: number,
          height: number,
        ) => ({
          data: new Uint8ClampedArray(width * height * 4),
          width,
          height,
        }),
      })),
    })
    const viewport = view.container.querySelector('.cs-viewport') as HTMLElement
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 300,
      height: 200,
      top: 0,
      right: 300,
      bottom: 200,
      left: 0,
      toJSON: () => ({}),
    })
    const loupe = view.getByLabelText('eyedropperMagnifier') as HTMLElement
    Object.defineProperties(loupe, {
      offsetWidth: { configurable: true, value: 286 },
      offsetHeight: { configurable: true, value: 88 },
    })

    await nextTick()
    frames.splice(0).forEach((callback) => callback(0))
    await fireEvent.pointerMove(scene, { clientX: 290, clientY: 190 })
    frames.shift()!(16)

    expect(loupe).toHaveAttribute('data-state', 'unavailable')
    expect(loupe).toHaveAttribute('data-horizontal-placement', 'left')
    expect(loupe).toHaveAttribute('data-vertical-placement', 'above')
    expect(loupe).toHaveTextContent('eyedropperNoOpaqueColour')
    expect(view.emitted().colorSample).toBeUndefined()
  })

  it.each([
    [0, false],
    [128, false],
    [255, true],
  ] as const)(
    'accepts a sampled scene pixel only when alpha is opaque (%s)',
    async (alpha, accepted) => {
      const view = render(CanvasViewport, {
        props: {
          documentState: {
            kind: 'ready',
            title: 'M08',
            dimensions: '120 × 80',
          },
          canvas: { width: 120, height: 80 },
          document: documentFixture(),
          sampling: true,
          zoom: 100,
          fitMode: false,
          t: (key: string) => key,
        } as never,
      })
      const scene = view.getByLabelText('sceneCanvas') as HTMLCanvasElement
      prepareScene(scene)
      vi.spyOn(scene, 'getContext').mockReturnValue({
        getImageData: () => ({
          data: new Uint8ClampedArray([171, 205, 239, alpha]),
        }),
      } as unknown as CanvasRenderingContext2D)

      await fireEvent.pointerDown(scene, {
        pointerId: alpha + 30,
        clientX: 30,
        clientY: 20,
      })

      if (accepted) {
        expect(view.emitted().colorSample).toEqual([['#ABCDEF']])
        expect(view.emitted().colorSampleError).toBeUndefined()
      } else {
        expect(view.emitted().colorSample).toBeUndefined()
        const errors = view.emitted()
          .colorSampleError as unknown as readonly (readonly unknown[])[]
        expect(errors[0]?.[0]).toBe('There is no opaque colour at this point')
      }
    },
  )

  it('shows snapping guides only while Alt is held and clears them on keyup and blur', async () => {
    const createdShape = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000000811',
      tool: 'shape',
      start: { x: 10, y: 10 },
      end: { x: 30, y: 30 },
    })
    if (!createdShape || createdShape.kind !== 'shape') {
      throw new Error('shape fixture should be created')
    }
    const shape = {
      ...createdShape,
      payload: {
        ...createdShape.payload,
        fill: {
          kind: 'solid' as const,
          color: { red: 1, green: 0, blue: 0, alpha: 1 },
          opacity: 1,
        },
      },
    }
    const document = { ...documentFixture(), layers: [shape] }
    const view = render(CanvasViewport, {
      props: {
        documentState: { kind: 'ready', title: 'M08', dimensions: '120 × 80' },
        canvas: document.canvas,
        document,
        selectedLayerId: shape.id,
        selectedLayerIds: [shape.id],
        zoom: 100,
        fitMode: false,
        t: (key: string) => key,
      } as never,
    })
    const scene = view.getByLabelText('sceneCanvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 10,
      clientX: 20,
      clientY: 20,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 10,
      clientX: 60,
      clientY: 40,
    })
    expect(view.emitted().selectLayer).toBeDefined()
    vi.mocked(contextFixture.current.moveTo).mockClear()

    await fireEvent.keyDown(window, { key: 'Alt' })
    expect(contextFixture.current.moveTo).toHaveBeenCalledWith(60, 0)
    expect(contextFixture.current.moveTo).toHaveBeenCalledWith(0, 40)
    vi.mocked(contextFixture.current.moveTo).mockClear()
    await fireEvent.keyUp(window, { key: 'Alt' })
    expect(contextFixture.current.moveTo).not.toHaveBeenCalledWith(60, 0)

    await fireEvent.keyDown(window, { key: 'Alt' })
    vi.mocked(contextFixture.current.moveTo).mockClear()
    await fireEvent(window, new Event('blur'))
    expect(contextFixture.current.moveTo).not.toHaveBeenCalledWith(60, 0)
    expect(view.emitted().documentCommand).toBeUndefined()
  })

  it('keeps the ruler angle guide overlay-only for the held shortcut lifetime', async () => {
    const { scene, emitted } = mountViewport('ruler')
    await fireEvent.pointerDown(scene, {
      pointerId: 23,
      clientX: 20,
      clientY: 20,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 23,
      clientX: 72,
      clientY: 47,
    })
    vi.mocked(contextFixture.current.moveTo).mockClear()

    await fireEvent.keyDown(window, { key: 'Alt' })
    expect(
      vi
        .mocked(contextFixture.current.moveTo)
        .mock.calls.filter(([x, y]) => x === 20 && y === 20),
    ).toHaveLength(2)
    vi.mocked(contextFixture.current.moveTo).mockClear()
    await fireEvent.keyUp(window, { key: 'Alt' })
    expect(
      vi
        .mocked(contextFixture.current.moveTo)
        .mock.calls.filter(([x, y]) => x === 20 && y === 20),
    ).toHaveLength(1)

    await fireEvent.keyDown(window, { key: 'Alt' })
    vi.mocked(contextFixture.current.moveTo).mockClear()
    await fireEvent(window, new Event('blur'))
    expect(
      vi
        .mocked(contextFixture.current.moveTo)
        .mock.calls.filter(([x, y]) => x === 20 && y === 20),
    ).toHaveLength(0)
    expect(emitted().addLayer).toBeUndefined()
    expect(emitted().documentCommand).toBeUndefined()
  })
})
