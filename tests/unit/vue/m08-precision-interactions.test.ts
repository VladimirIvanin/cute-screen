import { fireEvent, render, screen, within } from '@testing-library/vue'
import { markRaw, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  hitTestDocument,
  rulerVisualBoundsAreConservative,
  type RenderSceneSnapshot,
} from '@cute-screen/editor-core'

import {
  createEditorShellPinia,
  DocumentSessionController,
  type PrecisionToolDefaults,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import {
  Canvas2DRenderer,
  createCensorLayer,
  createDrawingLayer,
  createLoupeLayer,
  createRulerLayer,
  createSpotlightLayer,
  createTextLayer,
  type EditorDocumentV1,
  type RulerLayer,
} from '@cute-screen/editor-renderer'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import { selectLayerFromPanel } from './layer-selection'

function transformedPoint(
  transform: RulerLayer['transform'],
  point: Readonly<{ readonly x: number; readonly y: number }>,
): Readonly<{ readonly x: number; readonly y: number }> {
  const radians = (transform.rotation * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  return {
    x:
      point.x * transform.scaleX * cosine -
      point.y * transform.scaleY * sine +
      transform.translateX,
    y:
      point.x * transform.scaleX * sine +
      point.y * transform.scaleY * cosine +
      transform.translateY,
  }
}

const documentFixture = (
  crop: EditorDocumentV1['crop'] = null,
): EditorDocumentV1 => ({
  schemaVersion: 7,
  id: '019c1f62-058e-7000-8000-000000000800',
  source: {
    blobHash: 'a'.repeat(64),
    format: 'png',
    mimeType: 'image/png',
    width: 120,
    height: 80,
    orientationApplied: true,
    color: { colorSpace: 'srgb', hasIccProfile: false },
  },
  canvas: { width: 120, height: 80 },
  crop,
  layers: [],
  presentation: {
    beautify: { enabled: false },
    watermark: { enabled: false },
  },
  createdAt: '2026-08-15T00:00:00.000Z',
  updatedAt: '2026-08-15T00:00:00.000Z',
})

const precisionDefaults = {
  censor: {
    region: 'rectangle' as const,
    mode: 'pixelate' as const,
    blockSize: 12,
    blurStrength: 12,
    solidColor: { red: 0, green: 0, blue: 0, alpha: 1 },
  },
  spotlight: {
    shape: 'ellipse' as const,
    dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
    dimOpacity: 0.65,
    feather: 'soft' as const,
  },
  ruler: {
    unit: 'percent' as const,
    snap: true,
    snapAngleIncrementDegrees: 15,
    color: { red: 0.1, green: 0.8, blue: 0.4, alpha: 1 },
    thickness: 4,
    fontSize: 18,
  },
  loupe: {
    zoom: 3,
    size: 48,
    shape: 'rectangle' as const,
    borderColor: { red: 1, green: 1, blue: 1, alpha: 1 },
    borderWidth: 4,
    shadow: true,
  },
} as PrecisionToolDefaults

function precisionLayerFixture(
  kind: 'censor' | 'spotlight' | 'ruler' | 'loupe',
  locked = false,
): EditorDocumentV1['layers'][number] {
  const idByKind = {
    censor: '019c1f62-058e-7000-8000-000000000831',
    spotlight: '019c1f62-058e-7000-8000-000000000832',
    ruler: '019c1f62-058e-7000-8000-000000000833',
    loupe: '019c1f62-058e-7000-8000-000000000834',
  } as const
  const layer =
    kind === 'censor'
      ? createCensorLayer({
          id: idByKind[kind],
          region: {
            kind: 'rectangle',
            bounds: { x: 10, y: 10, width: 50, height: 30 },
          },
        })
      : kind === 'spotlight'
        ? createSpotlightLayer({
            id: idByKind[kind],
            bounds: { x: 10, y: 10, width: 50, height: 30 },
          })
        : kind === 'ruler'
          ? createRulerLayer({
              id: idByKind[kind],
              start: { x: 10, y: 20 },
              end: { x: 80, y: 20 },
              canvas: { width: 120, height: 80 },
            })
          : createLoupeLayer({
              id: idByKind[kind],
              sourceRegion: { x: 10, y: 10, width: 24, height: 24 },
              canvas: { width: 120, height: 80 },
              destination: { x: 60, y: 20 },
              zoom: 2,
              size: 48,
            })
  return { ...layer, locked }
}

function canvasContext() {
  return {
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
    measureText: vi.fn(() => ({
      width: 48,
      actualBoundingBoxAscent: 10,
      actualBoundingBoxDescent: 3,
    })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D
}

let currentContext: ReturnType<typeof canvasContext>

function prepareScene(
  scene: HTMLCanvasElement,
  cssWidth = 120,
  cssHeight = 80,
): void {
  Object.defineProperties(scene, {
    width: { configurable: true, writable: true, value: 120 },
    height: { configurable: true, writable: true, value: 80 },
  })
  vi.spyOn(scene, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    width: cssWidth,
    height: cssHeight,
    top: 0,
    right: 120,
    bottom: 80,
    left: 0,
    toJSON: () => ({}),
  })
  scene.setPointerCapture = vi.fn()
  scene.hasPointerCapture = vi.fn(() => false)
}

function mountViewport(
  activeTool: string,
  crop: EditorDocumentV1['crop'] = null,
) {
  return mountViewportDocument(activeTool, documentFixture(crop))
}

function mountViewportDocument(
  activeTool: string,
  document: EditorDocumentV1,
  defaults = precisionDefaults,
  selectedLayerId?: string,
) {
  const view = render(CanvasViewport, {
    props: {
      documentState: { kind: 'ready', title: 'M08', dimensions: '120 × 80' },
      canvas: document.canvas,
      document,
      selectedLayerId,
      activeTool,
      precisionDefaults: defaults,
      zoom: 100,
      fitMode: false,
      t: (key: string) => key,
    } as never,
  })
  const scene = view.getByLabelText('sceneCanvas') as HTMLCanvasElement
  prepareScene(scene)
  return { ...view, scene }
}

beforeEach(() => {
  window.localStorage.clear()
  currentContext = canvasContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    currentContext,
  )
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
      expect(currentContext.setTransform).toHaveBeenCalledWith(
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
        .mocked(currentContext.strokeRect)
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
        expect(currentContext.strokeRect).toHaveBeenCalledWith(10, 8, 80, 50),
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
      vi.mocked(currentContext.strokeRect).mockClear()
    }
  })
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
      expect(currentContext.strokeRect).toHaveBeenCalledWith(18, 18, 8, 8)
      expect(currentContext.fillText).toHaveBeenCalledWith(
        '2×',
        expect.any(Number),
        expect.any(Number),
      )
      expect(currentContext.fillText).toHaveBeenCalledWith(
        '48',
        expect.any(Number),
        expect.any(Number),
      )
    })
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
    vi.spyOn(scene, 'getContext').mockReturnValue({
      getImageData,
    } as unknown as CanvasRenderingContext2D)

    await fireEvent.pointerDown(scene, {
      pointerId: 21,
      clientX: 60,
      clientY: 40,
    })

    expect(getImageData).toHaveBeenCalledWith(30, 20, 1, 1)
    expect(view.emitted().colorSample).toEqual([['#ABCDEF']])
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
    vi.mocked(currentContext.moveTo).mockClear()

    await fireEvent.keyDown(window, { key: 'Alt' })
    expect(currentContext.moveTo).toHaveBeenCalledWith(60, 0)
    expect(currentContext.moveTo).toHaveBeenCalledWith(0, 40)
    vi.mocked(currentContext.moveTo).mockClear()
    await fireEvent.keyUp(window, { key: 'Alt' })
    expect(currentContext.moveTo).not.toHaveBeenCalledWith(60, 0)

    await fireEvent.keyDown(window, { key: 'Alt' })
    vi.mocked(currentContext.moveTo).mockClear()
    await fireEvent(window, new Event('blur'))
    expect(currentContext.moveTo).not.toHaveBeenCalledWith(60, 0)
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
    vi.mocked(currentContext.moveTo).mockClear()

    await fireEvent.keyDown(window, { key: 'Alt' })
    expect(
      vi
        .mocked(currentContext.moveTo)
        .mock.calls.filter(([x, y]) => x === 20 && y === 20),
    ).toHaveLength(2)
    vi.mocked(currentContext.moveTo).mockClear()
    await fireEvent.keyUp(window, { key: 'Alt' })
    expect(
      vi
        .mocked(currentContext.moveTo)
        .mock.calls.filter(([x, y]) => x === 20 && y === 20),
    ).toHaveLength(1)

    await fireEvent.keyDown(window, { key: 'Alt' })
    vi.mocked(currentContext.moveTo).mockClear()
    await fireEvent(window, new Event('blur'))
    expect(
      vi
        .mocked(currentContext.moveTo)
        .mock.calls.filter(([x, y]) => x === 20 && y === 20),
    ).toHaveLength(0)
    expect(emitted().addLayer).toBeUndefined()
    expect(emitted().documentCommand).toBeUndefined()
  })
})

describe('M08 shell lifecycle and contextual settings', () => {
  it('keeps precision settings in the bottom toolbar and auto-selects only loupe', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-vue',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Hide data' }))
    const toolbar = view.container.querySelector(
      '.cs-context-toolbar',
    ) as HTMLElement
    expect(within(toolbar).getByText('Effect')).toBeInTheDocument()
    expect(within(toolbar).getByText('Region')).toBeInTheDocument()
    const effect = within(toolbar).getByRole('combobox', { name: 'Effect' })
    await fireEvent.click(effect)
    for (const option of ['Pixelate', 'Blur', 'Solid']) {
      expect(
        await screen.findByRole('option', { name: option }),
      ).toBeInTheDocument()
    }
    await fireEvent.pointerDown(document.body)
    await fireEvent.click(screen.getByRole('button', { name: 'Show layers' }))
    expect(
      view.container.querySelector('.cs-layers-panel'),
    ).not.toHaveTextContent('Effect')

    await fireEvent.click(screen.getByRole('button', { name: 'Loupe' }))
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 5,
      clientX: 20,
      clientY: 20,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 5,
      clientX: 80,
      clientY: 50,
    })
    await fireEvent.pointerUp(scene, { pointerId: 5, clientX: 80, clientY: 50 })

    expect(session.snapshot.core.document.layers).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Loupe' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(view.container.querySelector('.cs-layer-row')).toHaveAttribute(
      'aria-selected',
      'true',
    )

    session.dispose()
    view.unmount()
  })

  it.each([
    ['censor', 'Hide data', 'Effect', 'Blur'],
    ['spotlight', 'Spotlight', 'Shape', 'Diamond'],
    ['ruler', 'Ruler', 'Thickness', ''],
    ['loupe', 'Loupe', 'Shape', 'Rectangle'],
  ] as const)(
    'disables every %s setting for a locked selection without history or default leakage, then updates after unlock',
    async (kind, toolLabel, controlLabel, optionLabel) => {
      const layer = precisionLayerFixture(kind)
      const session = new DocumentSessionController({
        document: { ...documentFixture(), layers: [layer] },
        revision: 1,
        bridge: {
          saveDocument: async () => 2,
          exportRecoveryBundle: async () => ({ kind: 'saved' }),
        },
        correlationId: () => `m08-locked-${kind}`,
        debounceMs: 60_000,
      })
      const pinia = createEditorShellPinia()
      const execute = vi.spyOn(session, 'execute')
      const view = render(EditorShell, {
        props: { documentSession: markRaw(session) },
        global: { plugins: [pinia] },
      })
      await fireEvent.click(screen.getByRole('button', { name: toolLabel }))
      await selectLayerFromPanel(view, { activateSelect: false })
      const layerButton = view.container.querySelector(
        '.cs-layer-select',
      ) as HTMLButtonElement
      expect(layerButton.closest('.cs-layer-row')).toHaveAttribute(
        'aria-selected',
        'true',
      )
      await fireEvent.click(screen.getByRole('button', { name: 'Lock layer' }))
      await vi.waitFor(() =>
        expect(session.snapshot.core.document.layers[0]?.locked).toBe(true),
      )
      expect(useEditorShellStore(pinia).selectedLayerIds).toEqual([layer.id])
      execute.mockClear()

      await screen.findByRole(kind === 'ruler' ? 'slider' : 'combobox', {
        name: controlLabel,
      })
      const toolbar = view.container.querySelector(
        '.cs-context-toolbar',
      ) as HTMLElement
      const toolbarButtons = within(toolbar).queryAllByRole('button')
      const toolbarComboboxes = within(toolbar).queryAllByRole('combobox')
      const toolbarSliders = within(toolbar).queryAllByRole('slider')
      expect(
        toolbarButtons.length +
          toolbarComboboxes.length +
          toolbarSliders.length,
      ).toBeGreaterThan(0)
      for (const button of toolbarButtons) {
        if (!(button as HTMLButtonElement).disabled) {
          throw new Error(
            `enabled precision toolbar button: ${button.getAttribute('aria-label') ?? button.textContent?.trim() ?? '<unlabelled>'}`,
          )
        }
      }
      for (const combobox of toolbarComboboxes) {
        expect(combobox).toHaveAttribute('aria-disabled', 'true')
      }
      for (const slider of toolbarSliders) {
        expect(slider).toHaveAttribute('aria-disabled', 'true')
      }

      const probe = within(toolbar).getByRole(
        kind === 'ruler' ? 'slider' : 'combobox',
        { name: controlLabel },
      ) as HTMLElement
      const before = structuredClone(session.snapshot.core.document)
      probe.focus()
      await fireEvent.keyDown(probe, { key: 'ArrowRight' })
      await fireEvent.keyDown(probe, { key: 'Enter' })
      await fireEvent.click(probe)
      expect(probe).toHaveAttribute('tabindex', '-1')
      expect(execute).not.toHaveBeenCalled()
      expect(session.snapshot.core.document).toEqual(before)
      expect(
        window.localStorage.getItem('cute-screen.drawing-tool-preferences.v1'),
      ).toBeNull()

      useEditorShellStore(pinia).clearLayerSelection()
      await fireEvent.click(screen.getByRole('button', { name: toolLabel }))
      const defaultControl = within(toolbar).getByRole(
        kind === 'ruler' ? 'slider' : 'combobox',
        { name: controlLabel },
      )
      if (kind === 'ruler') {
        expect(defaultControl).toHaveAttribute('aria-valuenow', '2')
      } else {
        expect(defaultControl).toHaveTextContent(
          kind === 'censor'
            ? 'Pixelate'
            : kind === 'spotlight'
              ? 'Rectangle'
              : 'Circle',
        )
      }

      layerButton.focus()
      await fireEvent.keyDown(layerButton, { key: 'Enter' })
      await fireEvent.click(
        screen.getByRole('button', { name: 'Unlock layer' }),
      )
      execute.mockClear()
      const enabledControl = within(toolbar).getByRole(
        kind === 'ruler' ? 'slider' : 'combobox',
        { name: controlLabel },
      )
      if (kind === 'ruler') {
        enabledControl.focus()
        await fireEvent.keyDown(enabledControl, { key: 'ArrowRight' })
      } else {
        await fireEvent.click(enabledControl)
        await fireEvent.click(
          await screen.findByRole('option', { name: optionLabel }),
        )
      }
      expect(execute).toHaveBeenCalledTimes(1)
      expect(session.snapshot.core.document.layers[0]).toMatchObject(
        kind === 'censor'
          ? { locked: false, payload: { effect: { mode: 'blur' } } }
          : kind === 'spotlight'
            ? { locked: false, payload: { shape: 'diamond' } }
            : kind === 'ruler'
              ? { locked: false, payload: { thickness: 3 } }
              : { locked: false, payload: { lens: { shape: 'rectangle' } } },
      )

      session.dispose()
      view.unmount()
    },
  )

  it('changes precision defaults without selection and commits only the created layer', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-censor-default',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })
    const execute = vi.spyOn(session, 'execute')
    await fireEvent.click(screen.getByRole('button', { name: 'Hide data' }))
    await fireEvent.click(screen.getByRole('combobox', { name: 'Effect' }))
    await fireEvent.click(await screen.findByRole('option', { name: 'Blur' }))
    expect(execute).not.toHaveBeenCalled()

    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 41,
      clientX: 12,
      clientY: 14,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 41,
      clientX: 72,
      clientY: 54,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 41,
      clientX: 72,
      clientY: 54,
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'blur', strength: 12 } },
    })

    session.dispose()
    view.unmount()
  })

  it('keeps a selected precision layer read-only when the document is read-only', async () => {
    const layer = precisionLayerFixture('ruler')
    const session = new DocumentSessionController({
      document: { ...documentFixture(), layers: [layer] },
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-read-only-ruler',
      debounceMs: 60_000,
    })
    const pinia = createEditorShellPinia()
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session), readOnlyDocument: true },
      global: { plugins: [pinia] },
    })
    const store = useEditorShellStore(pinia)
    store.selectLayer(layer.id)
    store.selectTool('ruler')
    const execute = vi.spyOn(session, 'execute')
    const toolbar = view.container.querySelector(
      '.cs-context-toolbar',
    ) as HTMLElement
    const thickness = await within(toolbar).findByRole('slider', {
      name: 'Thickness',
    })
    expect(thickness).toHaveAttribute('aria-disabled', 'true')
    expect(thickness).toHaveAttribute('tabindex', '-1')
    thickness.focus()
    await fireEvent.keyDown(thickness, { key: 'ArrowRight' })
    await fireEvent.click(thickness)
    expect(execute).not.toHaveBeenCalled()
    expect(session.snapshot.core.document.layers[0]).toEqual(layer)

    session.dispose()
    view.unmount()
  })

  it('updates a selected censor through one command and preserves deterministic undo/redo', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000823'),
    })
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-censor-update',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    const censorTool = screen.getByRole('button', { name: 'Hide data' })
    await fireEvent.click(censorTool)
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 22,
      clientX: 12,
      clientY: 14,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 22,
      clientX: 72,
      clientY: 54,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 22,
      clientX: 72,
      clientY: 54,
    })

    expect(censorTool).toHaveAttribute('aria-pressed', 'true')
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'pixelate' } },
    })
    await selectLayerFromPanel(view, { activateSelect: false })
    const layerButton = view.container.querySelector(
      '.cs-layer-select',
    ) as HTMLButtonElement
    expect(layerButton.closest('.cs-layer-row')).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await fireEvent.click(screen.getByRole('combobox', { name: 'Effect' }))
    await fireEvent.click(await screen.findByRole('option', { name: 'Blur' }))

    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'blur', strength: 12 } },
    })
    expect(censorTool).toHaveAttribute('aria-pressed', 'true')
    session.undo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'pixelate' } },
    })
    session.undo()
    expect(session.snapshot.core.document.layers).toHaveLength(0)
    session.redo()
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'censor',
      payload: { effect: { mode: 'blur', strength: 12 } },
    })

    session.dispose()
    view.unmount()
  })

  it('updates a selected ruler thickness through one command and preserves its visual fields through undo/redo', async () => {
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn(() => '019c1f62-058e-7000-8000-000000000824'),
    })
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-ruler-update',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Ruler' }))
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    await fireEvent.pointerDown(scene, {
      pointerId: 24,
      clientX: 16,
      clientY: 30,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 24,
      clientX: 80,
      clientY: 30,
    })
    await fireEvent.pointerUp(scene, {
      pointerId: 24,
      clientX: 80,
      clientY: 30,
    })
    await selectLayerFromPanel(view, { activateSelect: false })

    const thickness = await screen.findByRole('slider', { name: 'Thickness' })
    thickness.focus()
    await fireEvent.keyDown(thickness, { key: 'ArrowRight' })
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'ruler',
      payload: {
        color: { red: 227 / 255, green: 72 / 255, blue: 143 / 255, alpha: 1 },
        thickness: 3,
        fontSize: 14,
      },
    })
    session.undo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'ruler',
      payload: { thickness: 2 },
    })
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toMatchObject({
      kind: 'ruler',
      payload: { thickness: 3 },
    })

    session.dispose()
    view.unmount()
    vi.unstubAllGlobals()
  })

  it('canonicalizes one strong non-uniform ruler resize for its selection frame and badge hit with exact undo/redo', async () => {
    const ruler = precisionLayerFixture('ruler') as RulerLayer
    const beforeDocument = { ...documentFixture(), layers: [ruler] }
    const session = new DocumentSessionController({
      document: beforeDocument,
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-ruler-generic-resize',
      debounceMs: 60_000,
    })
    const pinia = createEditorShellPinia()
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [pinia] },
    })
    const store = useEditorShellStore(pinia)
    store.selectTool('select')
    store.selectLayer(ruler.id)
    await nextTick()
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    const execute = vi.spyOn(session, 'execute')
    const resizeStart = transformedPoint(ruler.transform, {
      x: ruler.localBounds.x + ruler.localBounds.width,
      y: ruler.localBounds.y + ruler.localBounds.height,
    })
    const resizeEnd = transformedPoint(ruler.transform, {
      x: ruler.localBounds.x + ruler.localBounds.width * 0.08,
      y: ruler.localBounds.y + ruler.localBounds.height * 0.3,
    })

    await fireEvent.pointerDown(scene, {
      pointerId: 26,
      clientX: resizeStart.x,
      clientY: resizeStart.y,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 26,
      clientX: resizeEnd.x,
      clientY: resizeEnd.y,
    })
    expect(execute).not.toHaveBeenCalled()
    await fireEvent.pointerUp(scene, {
      pointerId: 26,
      clientX: resizeEnd.x,
      clientY: resizeEnd.y,
    })

    expect(execute).toHaveBeenCalledTimes(1)
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'updateLayer',
        before: ruler,
        after: expect.objectContaining({ kind: 'ruler' }),
      }),
    )
    const after = session.snapshot.core.document.layers[0]
    if (after?.kind !== 'ruler') throw new Error('expected resized ruler')
    expect(after.transform.scaleX).toBeCloseTo(0.08, 10)
    expect(after.transform.scaleY).toBeCloseTo(0.3, 10)
    expect(rulerVisualBoundsAreConservative(after, beforeDocument.canvas)).toBe(
      true,
    )
    const worldFrameWidth = Math.abs(
      after.transform.scaleX * after.localBounds.width,
    )
    const worldFrameHeight = Math.abs(
      after.transform.scaleY * after.localBounds.height,
    )
    expect(worldFrameWidth).toBeGreaterThan(50)
    expect(worldFrameHeight).toBeGreaterThan(20)

    const rawResizeTransform = {
      ...ruler.transform,
      scaleX: ruler.transform.scaleX * 0.08,
      scaleY: ruler.transform.scaleY * 0.3,
    }
    const expectedEndpoints = [
      transformedPoint(rawResizeTransform, ruler.payload.start),
      transformedPoint(rawResizeTransform, ruler.payload.end),
    ] as const
    const actualEndpoints = [
      transformedPoint(after.transform, after.payload.start),
      transformedPoint(after.transform, after.payload.end),
    ] as const
    for (const index of [0, 1] as const) {
      expect(actualEndpoints[index].x).toBeCloseTo(
        expectedEndpoints[index].x,
        8,
      )
      expect(actualEndpoints[index].y).toBeCloseTo(
        expectedEndpoints[index].y,
        8,
      )
    }
    const [start, end] = actualEndpoints
    const length = Math.hypot(end.x - start.x, end.y - start.y)
    const badgePoint = {
      x: (start.x + end.x) / 2 - ((end.y - start.y) / length) * 8,
      y: (start.y + end.y) / 2 + ((end.x - start.x) / length) * 8,
    }
    expect(
      hitTestDocument(session.snapshot.core.document, badgePoint),
    ).toMatchObject({ nodeId: ruler.id, part: 'fill' })

    session.undo()
    expect(session.snapshot.core.document.layers[0]).toEqual(ruler)
    session.redo()
    expect(session.snapshot.core.document.layers[0]).toEqual(after)

    session.dispose()
    view.unmount()
  })

  it('exposes text-labelled persisted settings in English and Russian', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-settings',
      debounceMs: 60_000,
    })
    const pinia = createEditorShellPinia()
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [pinia] },
    })
    const toolbar = view.container.querySelector(
      '.cs-context-toolbar',
    ) as HTMLElement
    const english = [
      ['Hide data', ['Region', 'Effect']],
      ['Spotlight', ['Shape', 'Dim color', 'Dim opacity', 'Feather']],
      [
        'Ruler',
        ['Colour', 'Thickness', 'Label size', 'Unit', 'Snapping', 'Angle step'],
      ],
      [
        'Loupe',
        ['Zoom', 'Size', 'Shape', 'Border color', 'Border width', 'Shadow'],
      ],
    ] as const
    for (const [tool, labels] of english) {
      await fireEvent.click(screen.getByRole('button', { name: tool }))
      for (const label of labels) {
        expect(within(toolbar).getByText(label)).toBeInTheDocument()
      }
    }

    useEditorShellStore(pinia).setLocale('ru')
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Скрыть данные' }),
    )
    expect(within(toolbar).getByText('Область')).toBeInTheDocument()
    expect(within(toolbar).getByText('Эффект')).toBeInTheDocument()

    await fireEvent.click(
      await screen.findByRole('button', { name: 'Линейка' }),
    )
    for (const label of [
      'Цвет',
      'Толщина',
      'Размер подписи',
      'Единицы',
      'Привязка',
      'Шаг угла',
    ]) {
      expect(within(toolbar).getByText(label)).toBeInTheDocument()
    }
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Показать слои' }),
    )
    expect(
      view.container.querySelector('.cs-layers-panel'),
    ).not.toHaveTextContent(/Размер подписи|Шаг угла|Привязка/u)

    session.dispose()
    view.unmount()
  })

  it('keeps crop and precision tools disabled until a document canvas is ready', () => {
    render(EditorShell, {
      props: { fixture: 'loading' },
      global: { plugins: [createEditorShellPinia()] },
    })

    for (const tool of ['Crop', 'Hide data', 'Spotlight', 'Ruler', 'Loupe']) {
      expect(screen.getByRole('button', { name: tool })).toBeDisabled()
      expect(screen.getByRole('button', { name: tool })).toHaveAttribute(
        'title',
        'Open an image and wait until the canvas is ready.',
      )
    }
  })

  it('resets/reopens a canvas crop without a base layer and keeps undo/redo deterministic', async () => {
    const session = new DocumentSessionController({
      document: documentFixture({ x: 10, y: 8, width: 80, height: 50 }),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-crop',
      debounceMs: 60_000,
    })
    const view = render(EditorShell, {
      props: { documentSession: markRaw(session) },
      global: { plugins: [createEditorShellPinia()] },
    })

    const crop = screen.getByRole('button', { name: 'Crop' })
    expect(crop).toBeEnabled()
    await fireEvent.click(crop)
    const preset = screen.getByRole('combobox', { name: 'Preset' })
    expect(preset).toBeInTheDocument()
    await fireEvent.click(preset)
    for (const option of ['Free', '1:1', '4:3', '16:9', 'Original']) {
      expect(
        await screen.findByRole('option', { name: option }),
      ).toBeInTheDocument()
    }
    await fireEvent.pointerDown(document.body)
    await fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    await fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(session.snapshot.core.document.crop).toBeNull()
    expect(crop).toHaveAttribute('aria-pressed', 'true')

    session.undo()
    expect(session.snapshot.core.document.crop).toEqual({
      x: 10,
      y: 8,
      width: 80,
      height: 50,
    })
    session.redo()
    expect(session.snapshot.core.document.crop).toBeNull()

    session.dispose()
    view.unmount()
  })

  it('rejects a semi-transparent scene pixel before clipboard, swatch or recent-colour mutation', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-eyedropper-alpha',
      debounceMs: 60_000,
    })
    const writeClipboardText = vi.fn()
    const view = render(EditorShell, {
      props: {
        documentSession: markRaw(session),
        clipboardBridge: {
          readClipboardSnapshot: async () => ({}),
          writeClipboardText,
          stageImage: async () => {
            throw new Error('not used')
          },
          readImageBytes: async () => new ArrayBuffer(0),
        },
      },
      global: { plugins: [createEditorShellPinia()] },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Eyedropper' }))
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    vi.spyOn(scene, 'getContext').mockReturnValue({
      getImageData: () => ({
        data: new Uint8ClampedArray([171, 205, 239, 128]),
      }),
    } as unknown as CanvasRenderingContext2D)
    await fireEvent.pointerDown(scene, {
      pointerId: 42,
      clientX: 30,
      clientY: 20,
    })

    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'There is no opaque colour at this point',
      ),
    )
    expect(writeClipboardText).not.toHaveBeenCalled()
    expect(
      view.container.querySelector('.cs-eyedropper-swatch'),
    ).not.toBeInTheDocument()
    expect(
      window.localStorage.getItem('cute-screen.drawing-tool-preferences.v1'),
    ).toBeNull()
    expect(session.snapshot.core.canUndo).toBe(false)

    session.dispose()
    view.unmount()
  })

  it('keeps an uppercase sampled colour and accessible swatch when clipboard copy fails', async () => {
    const session = new DocumentSessionController({
      document: documentFixture(),
      revision: 1,
      bridge: {
        saveDocument: async () => 2,
        exportRecoveryBundle: async () => ({ kind: 'saved' }),
      },
      correlationId: () => 'm08-eyedropper',
      debounceMs: 60_000,
    })
    const writeClipboardText = vi
      .fn()
      .mockRejectedValue(new Error('clipboard busy'))
    const view = render(EditorShell, {
      props: {
        documentSession: markRaw(session),
        clipboardBridge: {
          readClipboardSnapshot: async () => ({}),
          writeClipboardText,
          stageImage: async () => {
            throw new Error('not used')
          },
          readImageBytes: async () => new ArrayBuffer(0),
        },
      },
      global: { plugins: [createEditorShellPinia()] },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Eyedropper' }))
    const scene = screen.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    vi.spyOn(scene, 'getContext').mockReturnValue({
      getImageData: () => ({
        data: new Uint8ClampedArray([171, 205, 239, 255]),
      }),
    } as unknown as CanvasRenderingContext2D)
    await fireEvent.pointerDown(scene, {
      pointerId: 12,
      clientX: 30,
      clientY: 20,
    })

    await vi.waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Colour selected: #ABCDEF. HEX could not be copied.',
      ),
    )
    expect(screen.getByLabelText('Colour swatch #ABCDEF')).toHaveStyle({
      backgroundColor: '#ABCDEF',
    })
    expect(writeClipboardText).toHaveBeenCalledWith(
      '#ABCDEF',
      expect.any(String),
    )
    expect(
      window.localStorage.getItem('cute-screen.drawing-tool-preferences.v1'),
    ).toContain('0.670588')
    expect(session.snapshot.core.canUndo).toBe(false)

    session.dispose()
    view.unmount()
  })
})
