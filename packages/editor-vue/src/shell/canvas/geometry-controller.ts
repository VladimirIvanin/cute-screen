import {
  BOUNDS_RESIZE_HANDLES,
  createDocumentRenderScene,
  resizeLayerGeometry,
  updateArrowHandle,
  updateCalloutHandle,
  type LayerNode,
  type SnapCandidate,
  type Transform2D,
} from '@cute-screen/editor-renderer'
import type { CanvasPoint, CanvasViewportProps } from './contracts'
import type { CanvasGesture, ResizeHandle } from './workspace-state'

export interface LayerBounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export function transformCanvasPoint(
  transform: Transform2D,
  point: CanvasPoint,
): CanvasPoint {
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

export function canvasLayerBounds(layer: LayerNode): LayerBounds {
  return layer.localBounds ?? { x: 0, y: 0, width: 1, height: 1 }
}

export interface CanvasGeometryContext {
  readonly props: CanvasViewportProps
  readonly gesture: () => CanvasGesture
}

export class CanvasGeometryController {
  readonly #context: CanvasGeometryContext

  constructor(context: CanvasGeometryContext) {
    this.#context = context
  }

  selectedLayer(): LayerNode | undefined {
    const { props } = this.#context
    return props.document?.layers.find(
      (layer) => layer.id === props.selectedLayerId,
    )
  }

  loupeSourceCenter(
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
  ): CanvasPoint {
    const { sourceRegion } = layer.payload
    return {
      x: sourceRegion.x + sourceRegion.width / 2,
      y: sourceRegion.y + sourceRegion.height / 2,
    }
  }

  moveLoupeSourceMarker(
    layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
    point: CanvasPoint,
  ): Extract<LayerNode, { readonly kind: 'loupe' }> {
    const canvas = this.#context.props.canvas
    if (!canvas) return layer
    const center = {
      x: Math.max(0, Math.min(canvas.width, point.x)),
      y: Math.max(0, Math.min(canvas.height, point.y)),
    }
    const source = layer.payload.sourceRegion
    return Object.freeze({
      ...layer,
      payload: Object.freeze({
        ...layer.payload,
        sourceRegion: Object.freeze({
          x: center.x - source.width / 2,
          y: center.y - source.height / 2,
          width: source.width,
          height: source.height,
        }),
      }),
    })
  }

  toLocal(layer: LayerNode, point: CanvasPoint): CanvasPoint {
    const radians = (-layer.transform.rotation * Math.PI) / 180
    const cosine = Math.cos(radians)
    const sine = Math.sin(radians)
    const x = point.x - layer.transform.translateX
    const y = point.y - layer.transform.translateY
    return {
      x: (x * cosine - y * sine) / layer.transform.scaleX,
      y: (x * sine + y * cosine) / layer.transform.scaleY,
    }
  }

  localBoundsHandlePositions(
    bounds: LayerBounds,
  ): Readonly<Record<ResizeHandle, CanvasPoint>> {
    return {
      nw: { x: bounds.x, y: bounds.y },
      n: { x: bounds.x + bounds.width / 2, y: bounds.y },
      ne: { x: bounds.x + bounds.width, y: bounds.y },
      e: {
        x: bounds.x + bounds.width,
        y: bounds.y + bounds.height / 2,
      },
      se: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      s: { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      sw: { x: bounds.x, y: bounds.y + bounds.height },
      w: { x: bounds.x, y: bounds.y + bounds.height / 2 },
    }
  }

  worldBoundsHandlePositions(
    layer: LayerNode,
    transform: Transform2D = layer.transform,
  ): Readonly<Record<ResizeHandle, CanvasPoint>> {
    const local = this.localBoundsHandlePositions(canvasLayerBounds(layer))
    return Object.fromEntries(
      BOUNDS_RESIZE_HANDLES.map((handle) => [
        handle,
        transformCanvasPoint(transform, local[handle]),
      ]),
    ) as Readonly<Record<ResizeHandle, CanvasPoint>>
  }

  snapCandidates(excludingId: string): readonly SnapCandidate[] {
    const document = this.#context.props.document
    if (!document) return []
    const candidates: SnapCandidate[] = [
      { id: 'canvas-top-left', x: 0, y: 0 },
      {
        id: 'canvas-center',
        x: document.canvas.width / 2,
        y: document.canvas.height / 2,
      },
      {
        id: 'canvas-bottom-right',
        x: document.canvas.width,
        y: document.canvas.height,
      },
    ]
    this.#appendCropCandidates(candidates)
    for (const layer of document.layers) {
      if (layer.id === excludingId || !layer.visible) continue
      this.#appendLayerCandidates(candidates, layer)
    }
    return candidates
  }

  resizeTransform(
    layer: LayerNode,
    handle: ResizeHandle,
    point: CanvasPoint,
    freeResize: boolean,
    centerResize: boolean,
  ): Transform2D {
    const bounds = canvasLayerBounds(layer)
    const local = this.toLocal(layer, point)
    const resizesX = handle.includes('w') || handle.includes('e')
    const resizesY = handle.includes('n') || handle.includes('s')
    const opposite = centerResize
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      : {
          x: handle.includes('w') ? bounds.x + bounds.width : bounds.x,
          y: handle.includes('n') ? bounds.y + bounds.height : bounds.y,
        }
    const corner = {
      x: handle.includes('w') ? bounds.x : bounds.x + bounds.width,
      y: handle.includes('n') ? bounds.y : bounds.y + bounds.height,
    }
    const minScale = 1 / Math.max(bounds.width, bounds.height)
    let factorX = resizesX
      ? (local.x - opposite.x) / (corner.x - opposite.x)
      : 1
    let factorY = resizesY
      ? (local.y - opposite.y) / (corner.y - opposite.y)
      : 1
    factorX = Math.max(minScale, factorX)
    factorY = Math.max(minScale, factorY)
    ;[factorX, factorY] = this.#preserveImageAspect(
      layer,
      freeResize,
      resizesX,
      resizesY,
      factorX,
      factorY,
    )
    return this.#anchoredTransform(layer, opposite, factorX, factorY)
  }

  previewTransform(layer: LayerNode): Transform2D {
    const gesture = this.#context.gesture()
    if (!gesture || !('id' in gesture) || gesture.id !== layer.id) {
      return layer.transform
    }
    if (gesture.kind === 'move') {
      return {
        ...layer.transform,
        translateX:
          layer.transform.translateX + gesture.current.x - gesture.start.x,
        translateY:
          layer.transform.translateY + gesture.current.y - gesture.start.y,
      }
    }
    if (gesture.kind === 'resize') {
      return this.resizeTransform(
        layer,
        gesture.handle,
        gesture.current,
        gesture.freeResize,
        gesture.centerResize,
      )
    }
    if (gesture.kind === 'rotate') {
      return { ...gesture.initial, rotation: gesture.currentAngle }
    }
    return layer.transform
  }

  gesturePreviewLayer(): LayerNode | undefined {
    const gesture = this.#context.gesture()
    if (!gesture || !('id' in gesture) || gesture.kind === 'loupeSource') {
      return undefined
    }
    const layer = this.#context.props.document?.layers.find(
      (candidate) => candidate.id === gesture.id,
    )
    if (!layer) return undefined
    if (gesture.kind === 'intrinsicResize') {
      return resizeLayerGeometry(layer, gesture.handle, gesture.current, {
        preserveAspect: gesture.preserveAspect,
        fromCenter: gesture.centerResize,
        ...(this.#context.props.document === undefined
          ? {}
          : { canvas: this.#context.props.document.canvas }),
      })
    }
    if (gesture.kind === 'arrowHandle') {
      return layer.kind === 'arrow'
        ? updateArrowHandle(
            layer,
            gesture.handle,
            this.toLocal(layer, gesture.current),
          )
        : undefined
    }
    if (gesture.kind === 'calloutHandle') {
      return layer.kind === 'callout'
        ? updateCalloutHandle(
            layer,
            gesture.handle,
            this.toLocal(layer, gesture.current),
          )
        : undefined
    }
    return { ...layer, transform: this.previewTransform(layer) }
  }

  gesturePreviewNodes() {
    const layer = this.gesturePreviewLayer()
    if (!layer || layer.kind === 'loupe' || !this.#context.props.document) {
      return []
    }
    return createDocumentRenderScene({
      ...this.#context.props.document,
      layers: [layer],
    }).nodes
  }

  #appendCropCandidates(candidates: SnapCandidate[]): void {
    const crop = this.#context.props.document?.crop
    if (!crop) return
    candidates.push(
      { id: 'crop-top-left', x: crop.x, y: crop.y },
      {
        id: 'crop-bottom-right',
        x: crop.x + crop.width,
        y: crop.y + crop.height,
      },
      {
        id: 'crop-center',
        x: crop.x + crop.width / 2,
        y: crop.y + crop.height / 2,
      },
    )
  }

  #appendLayerCandidates(candidates: SnapCandidate[], layer: LayerNode): void {
    const bounds = canvasLayerBounds(layer)
    const points = [
      { id: 'start', point: { x: bounds.x, y: bounds.y } },
      {
        id: 'center',
        point: {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        },
      },
      {
        id: 'end',
        point: { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      },
    ] as const
    for (const candidate of points) {
      const point = transformCanvasPoint(layer.transform, candidate.point)
      candidates.push({ id: `${layer.id}:${candidate.id}`, ...point })
    }
  }

  #preserveImageAspect(
    layer: LayerNode,
    freeResize: boolean,
    resizesX: boolean,
    resizesY: boolean,
    factorX: number,
    factorY: number,
  ): [number, number] {
    if (layer.kind !== 'image' || freeResize) return [factorX, factorY]
    const factor =
      resizesX && !resizesY
        ? factorX
        : !resizesX && resizesY
          ? factorY
          : Math.abs(factorX - 1) >= Math.abs(factorY - 1)
            ? factorX
            : factorY
    return [factor, factor]
  }

  #anchoredTransform(
    layer: LayerNode,
    opposite: CanvasPoint,
    factorX: number,
    factorY: number,
  ): Transform2D {
    const nextScaleX = layer.transform.scaleX * factorX
    const nextScaleY = layer.transform.scaleY * factorY
    const anchor = transformCanvasPoint(layer.transform, opposite)
    const rotation = (layer.transform.rotation * Math.PI) / 180
    const cosine = Math.cos(rotation)
    const sine = Math.sin(rotation)
    return {
      scaleX: nextScaleX,
      scaleY: nextScaleY,
      rotation: layer.transform.rotation,
      translateX:
        anchor.x -
        opposite.x * nextScaleX * cosine +
        opposite.y * nextScaleY * sine,
      translateY:
        anchor.y -
        opposite.x * nextScaleX * sine -
        opposite.y * nextScaleY * cosine,
    }
  }
}
