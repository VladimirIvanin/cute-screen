import type { Matrix2D, Point } from './document/types'
import { invertMatrix, transformPoint } from './geometry'

export type ViewportFitMode = 'fit' | 'actual' | 'custom'

export interface ViewportState {
  readonly width: number
  readonly height: number
  readonly dpr: number
  readonly zoom: number
  readonly pan: Point
  readonly fitMode: ViewportFitMode
  readonly canvasToScreen: Matrix2D
  readonly screenToCanvas: Matrix2D
}

const MIN_ZOOM = 0.1
const MAX_ZOOM = 16
const FIT_PADDING = 24

function matrix(zoom: number, pan: Point): Matrix2D {
  return Object.freeze({ a: zoom, b: 0, c: 0, d: zoom, e: pan.x, f: pan.y })
}

export function createViewportState(input: {
  readonly width: number
  readonly height: number
  readonly dpr: number
  readonly zoom: number
  readonly pan?: Point
  readonly fitMode?: ViewportFitMode
}): ViewportState {
  if (input.width <= 0 || input.height <= 0 || input.dpr <= 0) {
    throw new RangeError('viewport dimensions and DPR must be positive')
  }
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, input.zoom))
  const pan = input.pan ?? { x: 0, y: 0 }
  const canvasToScreen = matrix(zoom, pan)
  return Object.freeze({
    width: input.width,
    height: input.height,
    dpr: input.dpr,
    zoom,
    pan: Object.freeze({ ...pan }),
    fitMode: input.fitMode ?? 'custom',
    canvasToScreen,
    screenToCanvas: invertMatrix(canvasToScreen),
  })
}

export function fitViewport(
  viewport: Pick<ViewportState, 'width' | 'height' | 'dpr'>,
  canvas: { readonly width: number; readonly height: number },
): ViewportState {
  const zoom = Math.min(
    (viewport.width - FIT_PADDING * 2) / canvas.width,
    (viewport.height - FIT_PADDING * 2) / canvas.height,
  )
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
  return createViewportState({
    ...viewport,
    zoom: clamped,
    fitMode: 'fit',
    pan: {
      x: (viewport.width - canvas.width * clamped) / 2,
      y: (viewport.height - canvas.height * clamped) / 2,
    },
  })
}

export function zoomAt(
  viewport: ViewportState,
  screenPoint: Point,
  zoom: number,
): ViewportState {
  const canvasPoint = transformPoint(viewport.screenToCanvas, screenPoint)
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
  return createViewportState({
    ...viewport,
    zoom: nextZoom,
    fitMode: nextZoom === 1 ? 'actual' : 'custom',
    pan: {
      x: screenPoint.x - canvasPoint.x * nextZoom,
      y: screenPoint.y - canvasPoint.y * nextZoom,
    },
  })
}

/** Keeps panning within a 64 CSS pixel overscroll margin around the canvas. */
export function panViewport(
  viewport: ViewportState,
  canvas: { readonly width: number; readonly height: number },
  delta: Point,
): ViewportState {
  const overscroll = 64
  const scaledWidth = canvas.width * viewport.zoom
  const scaledHeight = canvas.height * viewport.zoom
  const minX = Math.min(overscroll, viewport.width - scaledWidth + overscroll)
  const maxX = Math.max(-overscroll, viewport.width - scaledWidth - overscroll)
  const minY = Math.min(overscroll, viewport.height - scaledHeight + overscroll)
  const maxY = Math.max(
    -overscroll,
    viewport.height - scaledHeight - overscroll,
  )
  const lowerX = Math.min(minX, maxX)
  const upperX = Math.max(minX, maxX)
  const lowerY = Math.min(minY, maxY)
  const upperY = Math.max(minY, maxY)
  return createViewportState({
    ...viewport,
    fitMode: 'custom',
    pan: {
      x: Math.min(upperX, Math.max(lowerX, viewport.pan.x + delta.x)),
      y: Math.min(upperY, Math.max(lowerY, viewport.pan.y + delta.y)),
    },
  })
}
