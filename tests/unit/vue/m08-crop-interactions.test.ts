import { fireEvent, render } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RenderSceneSnapshot } from '@cute-screen/editor-core'
import {
  Canvas2DRenderer,
  createTextLayer,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import {
  documentFixture,
  canvasContext,
  contextFixture,
  prepareScene,
  mountViewport,
  mountViewportDocument,
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

describe('M08 crop interaction', () => {
  it('uses committed output bounds normally and the full canvas while editing crop', async () => {
    const committed = { x: 20, y: 10, width: 60, height: 40 }
    const normal = mountViewport('censor', committed)
    const normalSurface = normal.container.querySelector(
      '.cs-canvas-surface',
    ) as HTMLDivElement

    expect(normalSurface.style.width).toBe('60px')
    expect(normalSurface.style.height).toBe('40px')
    await vi.waitFor(() => {
      expect(normal.scene.width).toBe(60)
      expect(normal.scene.height).toBe(40)
      expect(contextFixture.current.setTransform).toHaveBeenCalledWith(
        1,
        0,
        0,
        1,
        -20,
        -10,
      )
    })
    normal.unmount()

    const cropEdit = mountViewport('crop', committed)
    const cropSurface = cropEdit.container.querySelector(
      '.cs-canvas-surface',
    ) as HTMLDivElement
    expect(cropSurface.style.width).toBe('120px')
    expect(cropSurface.style.height).toBe('80px')
    await vi.waitFor(() => {
      expect(cropEdit.scene.width).toBe(120)
      expect(cropEdit.scene.height).toBe(80)
    })
  })

  it('maps cropped precision gestures to canvas space and samples the output bitmap locally', async () => {
    const crop = { x: 20, y: 10, width: 60, height: 40 }
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000899'),
    })

    for (const tool of ['censor', 'ruler'] as const) {
      const view = mountViewport(tool, crop)
      vi.spyOn(view.scene, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        width: 60,
        height: 40,
        top: 0,
        right: 60,
        bottom: 40,
        left: 0,
        toJSON: () => ({}),
      })
      await vi.waitFor(() => {
        expect(view.scene.width).toBe(60)
        expect(view.scene.height).toBe(40)
      })
      await fireEvent.pointerDown(view.scene, {
        pointerId: 11,
        clientX: 5,
        clientY: 6,
      })
      await fireEvent.pointerMove(view.scene, {
        pointerId: 11,
        clientX: 35,
        clientY: 26,
      })
      await fireEvent.pointerUp(view.scene, {
        pointerId: 11,
        clientX: 35,
        clientY: 26,
      })
      const emitted = view.emitted() as Record<string, unknown[][]>
      const addition = emitted.addLayer?.[0]?.[0]
      if (tool === 'censor') {
        expect(addition).toMatchObject({
          transform: { translateX: 25, translateY: 16 },
          localBounds: { x: 0, y: 0, width: 30, height: 20 },
          payload: { region: { kind: 'rectangle' } },
        })
      } else {
        const ruler = addition as {
          readonly transform: {
            readonly translateX: number
            readonly translateY: number
          }
          readonly payload: {
            readonly start: { readonly x: number; readonly y: number }
            readonly end: { readonly x: number; readonly y: number }
          }
        }
        expect(ruler.transform.translateX + ruler.payload.start.x).toBeCloseTo(
          25,
          10,
        )
        expect(ruler.transform.translateY + ruler.payload.start.y).toBeCloseTo(
          16,
          10,
        )
        expect(ruler.transform.translateX + ruler.payload.end.x).toBeCloseTo(
          55,
          10,
        )
        expect(ruler.transform.translateY + ruler.payload.end.y).toBeCloseTo(
          36,
          10,
        )
      }
      view.unmount()
    }

    const sampled = render(CanvasViewport, {
      props: {
        documentState: { kind: 'ready', title: 'M08', dimensions: '120 × 80' },
        canvas: documentFixture(crop).canvas,
        document: documentFixture(crop),
        sampling: true,
        zoom: 100,
        fitMode: false,
        t: (key: string) => key,
      } as never,
    })
    const sampledScene = sampled.getByLabelText(
      'sceneCanvas',
    ) as HTMLCanvasElement
    prepareScene(sampledScene, 60, 40)
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([39, 61, 90, 255]),
    }))
    await vi.waitFor(() => {
      expect(sampledScene.width).toBe(60)
      expect(sampledScene.height).toBe(40)
    })
    vi.spyOn(sampledScene, 'getContext').mockReturnValue({
      getImageData,
    } as unknown as CanvasRenderingContext2D)
    await fireEvent.pointerDown(sampledScene, {
      pointerId: 12,
      clientX: 7,
      clientY: 9,
    })
    expect(getImageData).toHaveBeenCalledWith(7, 9, 1, 1)
    expect(sampled.emitted().colorSample).toEqual([['#273D5A']])
    vi.unstubAllGlobals()
  })

  it('offsets direct text editing by the crop origin and preserves output bounds in its rebuilt scene', async () => {
    const crop = { x: 20, y: 10, width: 60, height: 40 }
    const text = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000898',
      text: 'Crop text',
      origin: { x: 30, y: 20 },
      fixedWidth: 40,
    })!
    const setScene = vi.spyOn(Canvas2DRenderer.prototype, 'setScene')
    const view = mountViewportDocument('select', {
      ...documentFixture(crop),
      layers: [text],
    })
    vi.spyOn(view.scene, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 60,
      height: 40,
      top: 0,
      right: 60,
      bottom: 40,
      left: 0,
      toJSON: () => ({}),
    })

    await fireEvent.dblClick(view.scene, { clientX: 15, clientY: 15 })
    const editor = view.getByLabelText('Text editor') as HTMLDivElement
    expect(editor.style.left).toBe('10px')
    expect(editor.style.top).toBe('10px')
    await vi.waitFor(() => {
      const rebuilt = setScene.mock.calls.at(-1)?.[0] as
        RenderSceneSnapshot | undefined
      expect(rebuilt?.outputBounds).toEqual(crop)
    })
  })

  it('keeps handle drags transient and applies one crop command on Enter', async () => {
    const { scene, emitted } = mountViewport('crop')

    await vi.waitFor(() => {
      const handleRects = vi
        .mocked(contextFixture.current.strokeRect)
        .mock.calls.filter((call) => call[2] === 8 && call[3] === 8)
      expect(handleRects).toHaveLength(8)
    })

    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 120,
      clientY: 40,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 100,
      clientY: 40,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 1,
      clientX: 100,
      clientY: 40,
    })

    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.keyDown(window, { key: 'Enter' })
    expect(emitted().documentCommand).toEqual([
      [
        {
          type: 'setCrop',
          before: null,
          after: { x: 0, y: 0, width: 100, height: 80 },
        },
      ],
    ])
  })

  it('reopens the committed crop, nudges it, resets it and cancels without a command', async () => {
    const { scene, emitted } = mountViewport('crop', {
      x: 10,
      y: 8,
      width: 80,
      height: 50,
    })

    scene.focus()
    await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
    await fireEvent.keyDown(window, { key: 'Escape' })

    expect(emitted().documentCommand).toBeUndefined()
    expect(emitted().selectTool).toEqual([['select']])
  })

  it('uses immutable canvas dimensions after base resize, flip and removal', async () => {
    const baseLayer: EditorDocumentV1['layers'][number] = {
      id: '019c1f62-058e-7000-8000-000000000821',
      kind: 'image',
      localBounds: { x: 0, y: 0, width: 18, height: 12 },
      transform: {
        translateX: 74,
        translateY: 53,
        rotation: 0,
        scaleX: -2,
        scaleY: 0.5,
      },
      opacity: 1,
      blendMode: 'normal',
      shadows: [],
      visible: true,
      locked: true,
      payload: {
        blobHash: 'a'.repeat(64),
        intrinsicWidth: 120,
        intrinsicHeight: 80,
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
    const crop = { x: 10, y: 8, width: 80, height: 50 }
    const variants = [
      {
        ...documentFixture(crop),
        layers: [
          {
            ...baseLayer,
            transform: { ...baseLayer.transform, scaleX: 2 },
          },
        ],
      },
      { ...documentFixture(crop), layers: [baseLayer] },
      {
        ...documentFixture(crop),
        layers: [
          {
            ...baseLayer,
            localBounds: { x: 0, y: 0, width: 7, height: 5 },
          },
        ],
      },
      documentFixture(crop),
    ]

    for (const document of variants) {
      const view = mountViewportDocument('crop', document)
      await vi.waitFor(() =>
        expect(contextFixture.current.strokeRect).toHaveBeenCalledWith(
          10,
          8,
          80,
          50,
        ),
      )
      await fireEvent.keyDown(window, { key: 'ArrowRight', shiftKey: true })
      await fireEvent.keyDown(window, { key: 'Enter' })
      expect(view.emitted().documentCommand).toEqual([
        [
          {
            type: 'setCrop',
            before: crop,
            after: { x: 20, y: 8, width: 80, height: 50 },
          },
        ],
      ])
      view.unmount()
      vi.mocked(contextFixture.current.strokeRect).mockClear()
    }
  })
})
