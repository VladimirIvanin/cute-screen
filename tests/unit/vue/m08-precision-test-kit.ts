import { render } from '@testing-library/vue'
import { vi } from 'vitest'
import type { PrecisionToolDefaults } from '@cute-screen/editor-vue'
import {
  createCensorLayer,
  createLoupeLayer,
  createRulerLayer,
  createSpotlightLayer,
  type EditorDocumentV1,
  type RulerLayer,
} from '@cute-screen/editor-renderer'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'

export function transformedPoint(
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

export const documentFixture = (
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

export const precisionDefaults = {
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

export function precisionLayerFixture(
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

export function canvasContext() {
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
    putImageData: vi.fn(),
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

export const contextFixture = {
  current: undefined as unknown as ReturnType<typeof canvasContext>,
}

export function prepareScene(
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

export function mountViewport(
  activeTool: string,
  crop: EditorDocumentV1['crop'] = null,
) {
  return mountViewportDocument(activeTool, documentFixture(crop))
}

export function mountViewportDocument(
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
