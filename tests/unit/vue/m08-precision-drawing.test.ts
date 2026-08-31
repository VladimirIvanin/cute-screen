import { fireEvent, render } from '@testing-library/vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import {
  documentFixture,
  precisionDefaults,
  precisionLayerFixture,
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

describe('M08 manual precision tools', () => {
  it.each([
    ['censor', 'censor'],
    ['spotlight', 'spotlight'],
    ['ruler', 'ruler'],
    ['loupe', 'loupe'],
  ] as const)('commits one %s layer only on pointer-up', async (tool, kind) => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(
        () => `019c1f62-058e-7000-8000-00000000080${kind.length}`,
      ),
    })
    const { scene, emitted } = mountViewport(tool)

    await fireEvent.pointerDown(scene, {
      pointerId: 2,
      clientX: 12,
      clientY: 14,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 2,
      clientX: 76,
      clientY: 58,
    })
    expect(emitted().addLayer).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 2, clientX: 76, clientY: 58 })

    expect(emitted().addLayer).toHaveLength(1)
    const additions = emitted()
      .addLayer as unknown as readonly (readonly unknown[])[]
    const layer = additions[0]?.[0]
    expect(layer).toMatchObject({ kind })
    if (kind === 'censor') {
      expect(layer).toMatchObject({
        payload: {
          region: { kind: 'rectangle' },
          effect: { mode: 'pixelate', blockSize: 12 },
          sampleSource: 'compositeBelow',
        },
      })
    } else if (kind === 'spotlight') {
      expect(layer).toMatchObject({
        payload: {
          shape: 'ellipse',
          dimOpacity: 0.65,
          feather: 'soft',
        },
      })
    } else if (kind === 'ruler') {
      expect(layer).toMatchObject({
        payload: {
          unit: 'percent',
          snapAngleIncrementDegrees: 15,
          color: { red: 0.1, green: 0.8, blue: 0.4, alpha: 1 },
          thickness: 4,
          fontSize: 18,
        },
      })
    } else {
      expect(layer).toMatchObject({
        payload: {
          zoom: 3,
          lens: { size: 48, shape: 'rectangle' },
          border: { width: 4 },
          sampleSource: 'compositeBelow',
        },
      })
    }
    expect(additions[0]?.[1]).toBe(kind === 'loupe')
    vi.unstubAllGlobals()
  })

  it('shows source marker and zoom/size chips only for a selected loupe', async () => {
    const loupe = precisionLayerFixture('loupe')
    mountViewportDocument(
      'select',
      { ...documentFixture(), layers: [loupe] },
      precisionDefaults,
      loupe.id,
    )

    await vi.waitFor(() => {
      expect(contextFixture.current.strokeRect).toHaveBeenCalledWith(
        18,
        18,
        8,
        8,
      )
      expect(contextFixture.current.fillText).toHaveBeenCalledWith(
        '2×',
        expect.any(Number),
        expect.any(Number),
      )
      expect(contextFixture.current.fillText).toHaveBeenCalledWith(
        '48',
        expect.any(Number),
        expect.any(Number),
      )
    })
  })

  it('moves a selected loupe source marker in one document command', async () => {
    const loupe = precisionLayerFixture('loupe')
    const { scene, emitted } = mountViewportDocument(
      'loupe',
      { ...documentFixture(), layers: [loupe] },
      precisionDefaults,
      loupe.id,
    )

    await fireEvent.pointerDown(scene, {
      pointerId: 29,
      clientX: 22,
      clientY: 22,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 29,
      clientX: 42,
      clientY: 30,
    })
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, {
      pointerId: 29,
      clientX: 42,
      clientY: 30,
    })

    expect(emitted().documentCommand).toEqual([
      [
        {
          type: 'updateLayer',
          before: loupe,
          after: expect.objectContaining({
            id: loupe.id,
            kind: 'loupe',
            payload: expect.objectContaining({
              sourceRegion: { x: 30, y: 18, width: 24, height: 24 },
            }),
          }),
        },
      ],
    ])
    expect(emitted().addLayer).toBeUndefined()
  })

  it('commits a freeform censor polygon from the transient pointer path', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000822'),
    })
    const defaults = {
      ...precisionDefaults,
      censor: { ...precisionDefaults.censor, region: 'freeform' as const },
    }
    const { scene, emitted } = mountViewportDocument(
      'censor',
      documentFixture(),
      defaults,
    )

    await fireEvent.pointerDown(scene, {
      pointerId: 20,
      clientX: 12,
      clientY: 14,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 20,
      clientX: 70,
      clientY: 18,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 20,
      clientX: 48,
      clientY: 60,
    })
    expect(emitted().addLayer).toBeUndefined()
    await fireEvent.pointerUp(scene, {
      pointerId: 20,
      clientX: 12,
      clientY: 14,
    })

    const additions = emitted()
      .addLayer as unknown as readonly (readonly unknown[])[]
    expect(additions[0]?.[0]).toMatchObject({
      kind: 'censor',
      payload: {
        region: {
          kind: 'freeform',
          points: expect.arrayContaining([
            expect.objectContaining({
              x: expect.any(Number),
              y: expect.any(Number),
            }),
          ]),
        },
      },
    })
  })

  it('reports a not-ready eyedropper scene and cancels sampling with a secondary pointer', async () => {
    const view = render(CanvasViewport, {
      props: {
        documentState: { kind: 'ready', title: 'M08', dimensions: '120 × 80' },
        canvas: { width: 120, height: 80 },
        document: documentFixture(),
        sampling: true,
        samplingBlocked: true,
        zoom: 100,
        fitMode: false,
        t: (key: string) => key,
      } as never,
    })
    const scene = view.getByLabelText('sceneCanvas') as HTMLCanvasElement
    prepareScene(scene)

    await fireEvent.pointerDown(scene, {
      pointerId: 3,
      clientX: 12,
      clientY: 14,
    })
    const errors = view.emitted()
      .colorSampleError as unknown as readonly (readonly unknown[])[]
    expect(errors[0]?.[0]).toMatch(/loading|ready/i)
    await fireEvent.pointerDown(scene, {
      pointerId: 4,
      button: 2,
      clientX: 12,
      clientY: 14,
    })
    expect(view.emitted().colorSampleCancel).toHaveLength(1)
    await fireEvent.keyDown(window, { key: 'Escape' })
    expect(view.emitted().colorSampleCancel).toHaveLength(2)
  })

  it('maps a zoomed viewport point into scene image space before sampling', async () => {
    const view = render(CanvasViewport, {
      props: {
        documentState: { kind: 'ready', title: 'M08', dimensions: '120 × 80' },
        canvas: { width: 120, height: 80 },
        document: documentFixture(),
        sampling: true,
        zoom: 200,
        fitMode: false,
        t: (key: string) => key,
      } as never,
    })
    const scene = view.getByLabelText('sceneCanvas') as HTMLCanvasElement
    prepareScene(scene, 240, 160)
    const getImageData = vi.fn(() => ({
      data: new Uint8ClampedArray([171, 205, 239, 255]),
    }))
    Object.defineProperty(scene, 'getContext', {
      configurable: true,
      value: vi.fn(() => ({ getImageData })),
    })

    await fireEvent.pointerDown(scene, {
      pointerId: 21,
      clientX: 60,
      clientY: 40,
    })

    expect(getImageData).toHaveBeenCalledWith(30, 20, 1, 1)
    expect(view.emitted().colorSample).toEqual([['#ABCDEF']])
  })
})
