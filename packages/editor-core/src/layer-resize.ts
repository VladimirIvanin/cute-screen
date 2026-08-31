import type {
  EditorDocumentV1,
  JsonObject,
  LayerNode,
  Point,
  Rect,
  RichTextContent,
} from './document/types'
import { invertMatrix, transformPoint, transformToMatrix } from './geometry'
import { assertValidLoupeSourceRegion } from './tools/precision/shared'
import { rebaseRulerLayer } from './tools/precision/ruler'

export const BOUNDS_RESIZE_HANDLES = [
  'nw',
  'n',
  'ne',
  'e',
  'se',
  's',
  'sw',
  'w',
] as const

export type BoundsResizeHandle = (typeof BOUNDS_RESIZE_HANDLES)[number]
export type IntrinsicResizeHandle = BoundsResizeHandle | 'start' | 'end'
export type LayerResizeCapability =
  | 'imageTransform'
  | 'bounds'
  | 'points'
  | 'textWidth'
  | 'loupe'
  | 'ruler'
  | 'semantic'
  | 'none'

export interface ResizeLayerGeometryOptions {
  readonly preserveAspect?: boolean
  readonly fromCenter?: boolean
  readonly canvas?: Readonly<{
    readonly width: number
    readonly height: number
  }>
}

const MINIMUM_SIZE = 1

export function layerResizeCapability(layer: LayerNode): LayerResizeCapability {
  switch (layer.kind) {
    case 'image':
      return 'imageTransform'
    case 'shape':
    case 'spotlight':
    case 'censor':
    case 'emoji':
      return 'bounds'
    case 'pencil':
    case 'marker':
      return 'points'
    case 'text':
      return 'textWidth'
    case 'loupe':
      return 'loupe'
    case 'ruler':
      return 'ruler'
    case 'arrow':
    case 'callout':
      return 'semantic'
    case 'numberedMarker':
      return 'none'
  }
}

export function layerIntrinsicResizeHandles(
  layer: LayerNode,
): readonly IntrinsicResizeHandle[] {
  switch (layerResizeCapability(layer)) {
    case 'bounds':
      return layer.kind === 'emoji'
        ? (['nw', 'ne', 'se', 'sw'] as const)
        : BOUNDS_RESIZE_HANDLES
    case 'points':
      return BOUNDS_RESIZE_HANDLES
    case 'textWidth':
      return ['e', 'w']
    case 'loupe':
      return ['nw', 'ne', 'se', 'sw']
    case 'ruler':
      return ['start', 'end']
    default:
      return []
  }
}

function unitScale(value: number): boolean {
  return Math.abs(value) === 1
}

export function assertLayerEditableScale(layer: LayerNode): void {
  if (
    layer.kind !== 'image' &&
    (!unitScale(layer.transform.scaleX) || !unitScale(layer.transform.scaleY))
  ) {
    throw new Error(
      `non-image layer ${layer.id} cannot use non-unit transform scale`,
    )
  }
}

export function normalizeEditableLayerScale(layer: LayerNode): LayerNode {
  if (
    layer.kind === 'image' ||
    (unitScale(layer.transform.scaleX) && unitScale(layer.transform.scaleY))
  ) {
    return layer
  }
  return Object.freeze({
    ...layer,
    transform: Object.freeze({
      ...layer.transform,
      scaleX: 1,
      scaleY: 1,
    }),
  }) as LayerNode
}

export function normalizeEditableDocumentScales(
  document: EditorDocumentV1,
): EditorDocumentV1 {
  let changed = false
  const layers = document.layers.map((layer) => {
    const normalized = normalizeEditableLayerScale(layer)
    changed ||= normalized !== layer
    return normalized
  })
  return changed
    ? Object.freeze({ ...document, layers: Object.freeze(layers) })
    : document
}

function localPoint(layer: LayerNode, point: Point): Point {
  return transformPoint(invertMatrix(transformToMatrix(layer.transform)), point)
}

function clampLower(value: number, upper: number): number {
  return Math.min(value, upper - MINIMUM_SIZE)
}

function clampUpper(value: number, lower: number): number {
  return Math.max(value, lower + MINIMUM_SIZE)
}

function resizedBounds(
  bounds: Rect,
  handle: BoundsResizeHandle,
  point: Point,
  options: ResizeLayerGeometryOptions,
): Rect {
  const centre = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  }
  let left = bounds.x
  let right = bounds.x + bounds.width
  let top = bounds.y
  let bottom = bounds.y + bounds.height
  const changesLeft = handle.includes('w')
  const changesRight = handle.includes('e')
  const changesTop = handle.includes('n')
  const changesBottom = handle.includes('s')

  if (options.fromCenter) {
    if (changesLeft || changesRight) {
      const halfWidth = Math.max(MINIMUM_SIZE / 2, Math.abs(point.x - centre.x))
      left = centre.x - halfWidth
      right = centre.x + halfWidth
    }
    if (changesTop || changesBottom) {
      const halfHeight = Math.max(
        MINIMUM_SIZE / 2,
        Math.abs(point.y - centre.y),
      )
      top = centre.y - halfHeight
      bottom = centre.y + halfHeight
    }
  } else {
    if (changesLeft) left = clampLower(point.x, right)
    if (changesRight) right = clampUpper(point.x, left)
    if (changesTop) top = clampLower(point.y, bottom)
    if (changesBottom) bottom = clampUpper(point.y, top)
  }

  if (
    options.preserveAspect &&
    (changesLeft || changesRight) &&
    (changesTop || changesBottom)
  ) {
    const widthFactor = (right - left) / bounds.width
    const heightFactor = (bottom - top) / bounds.height
    const factor =
      Math.abs(widthFactor - 1) >= Math.abs(heightFactor - 1)
        ? widthFactor
        : heightFactor
    const width = Math.max(MINIMUM_SIZE, bounds.width * factor)
    const height = Math.max(MINIMUM_SIZE, bounds.height * factor)
    if (options.fromCenter) {
      left = centre.x - width / 2
      right = centre.x + width / 2
      top = centre.y - height / 2
      bottom = centre.y + height / 2
    } else {
      if (changesLeft) left = bounds.x + bounds.width - width
      else right = bounds.x + width
      if (changesTop) top = bounds.y + bounds.height - height
      else bottom = bounds.y + height
    }
  }

  return Object.freeze({
    x: left,
    y: top,
    width: Math.max(MINIMUM_SIZE, right - left),
    height: Math.max(MINIMUM_SIZE, bottom - top),
  })
}

function squareBounds(
  original: Rect,
  resized: Rect,
  handle: BoundsResizeHandle,
  fromCenter: boolean,
  minimum = MINIMUM_SIZE,
  maximum = Number.POSITIVE_INFINITY,
): Rect {
  const side = Math.max(
    minimum,
    Math.min(maximum, Math.max(resized.width, resized.height)),
  )
  if (fromCenter) {
    const centre = {
      x: original.x + original.width / 2,
      y: original.y + original.height / 2,
    }
    return Object.freeze({
      x: centre.x - side / 2,
      y: centre.y - side / 2,
      width: side,
      height: side,
    })
  }
  return Object.freeze({
    x: handle.includes('w') ? original.x + original.width - side : original.x,
    y: handle.includes('n') ? original.y + original.height - side : original.y,
    width: side,
    height: side,
  })
}

function mapPoint(point: Point, before: Rect, after: Rect): Point {
  return Object.freeze({
    x: after.x + ((point.x - before.x) / before.width) * after.width,
    y: after.y + ((point.y - before.y) / before.height) * after.height,
  })
}

function estimatedTextHeight(content: RichTextContent, width: number): number {
  const fontSize = Math.max(8, ...content.spans.map((span) => span.fontSize))
  const characterWidth = fontSize * 0.6
  const lines = content.text
    .split('\n')
    .reduce(
      (total, line) =>
        total + Math.max(1, Math.ceil((line.length * characterWidth) / width)),
      0,
    )
  return Math.max(fontSize * 1.25, lines * fontSize * 1.25)
}

function resizeRuler(
  layer: Extract<LayerNode, { readonly kind: 'ruler' }>,
  handle: 'start' | 'end',
  point: Point,
  options: ResizeLayerGeometryOptions,
): LayerNode {
  if (!options.canvas)
    throw new Error('ruler resize requires canvas dimensions')
  const next = localPoint(layer, point)
  const other = handle === 'start' ? layer.payload.end : layer.payload.start
  if (next.x === other.x && next.y === other.y) return layer
  return rebaseRulerLayer(
    layer,
    Object.freeze({ ...layer.payload, [handle]: next }),
    options.canvas,
  )
}

function resizeText(
  layer: Extract<LayerNode, { readonly kind: 'text' }>,
  requested: Rect,
): LayerNode {
  const bounds = Object.freeze({
    ...requested,
    y: layer.localBounds.y,
    height: estimatedTextHeight(layer.payload.content, requested.width),
  })
  return Object.freeze({
    ...layer,
    localBounds: bounds,
    payload: Object.freeze({
      ...layer.payload,
      content: Object.freeze({
        ...layer.payload.content,
        wrap: 'fixedWidth' as const,
        fixedWidth: bounds.width,
      }),
    }),
  })
}

function resizeLoupe(
  layer: Extract<LayerNode, { readonly kind: 'loupe' }>,
  requested: Rect,
  handle: BoundsResizeHandle,
  options: ResizeLayerGeometryOptions,
): LayerNode {
  if (!options.canvas)
    throw new Error('loupe resize requires canvas dimensions')
  const source = layer.payload.sourceRegion
  const sourceCentre = {
    x: source.x + source.width / 2,
    y: source.y + source.height / 2,
  }
  const minimumSourceHalfSize = Math.max(
    0,
    -sourceCentre.x,
    sourceCentre.x - options.canvas.width,
    -sourceCentre.y,
    sourceCentre.y - options.canvas.height,
  )
  const bounds = squareBounds(
    layer.localBounds,
    requested,
    handle,
    options.fromCenter === true,
    Math.max(16, (minimumSourceHalfSize * 2 + 1e-6) * layer.payload.zoom),
    2_048,
  )
  const sourceSize = bounds.width / layer.payload.zoom
  const sourceRegion = Object.freeze({
    x: sourceCentre.x - sourceSize / 2,
    y: sourceCentre.y - sourceSize / 2,
    width: sourceSize,
    height: sourceSize,
  })
  assertValidLoupeSourceRegion(sourceRegion, options.canvas)
  return Object.freeze({
    ...layer,
    localBounds: bounds,
    payload: Object.freeze({
      ...layer.payload,
      sourceRegion,
      lens: Object.freeze({ ...layer.payload.lens, size: bounds.width }),
    }),
  })
}

function resizePointLayer(
  layer: Extract<LayerNode, { readonly kind: 'pencil' | 'marker' }>,
  requested: Rect,
): LayerNode {
  const points = (
    layer.payload.points as unknown as readonly (Point &
      Readonly<{ readonly pressure: number }>)[]
  ).map((sample) =>
    Object.freeze({
      ...mapPoint(sample, layer.localBounds, requested),
      pressure: sample.pressure,
    }),
  )
  return Object.freeze({
    ...layer,
    localBounds: requested,
    payload: Object.freeze({ ...layer.payload, points: Object.freeze(points) }),
  }) as LayerNode
}

function resizeFreeformCensor(
  layer: Extract<LayerNode, { readonly kind: 'censor' }>,
  requested: Rect,
): LayerNode {
  const points =
    layer.payload.region.kind === 'freeform'
      ? layer.payload.region.points.map(
          (sample) =>
            Object.freeze({
              ...mapPoint(sample, layer.localBounds, requested),
            }) as Point & JsonObject,
        )
      : []
  return Object.freeze({
    ...layer,
    localBounds: requested,
    payload: Object.freeze({
      ...layer.payload,
      region: Object.freeze({ kind: 'freeform' as const, points }),
    }),
  })
}

export function resizeLayerGeometry(
  layer: LayerNode,
  handle: IntrinsicResizeHandle,
  point: Point,
  options: ResizeLayerGeometryOptions = {},
): LayerNode {
  assertLayerEditableScale(layer)
  if (layer.locked) throw new Error(`layer ${layer.id} is locked`)
  const capability = layerResizeCapability(layer)
  if (capability === 'ruler') {
    if (layer.kind !== 'ruler' || (handle !== 'start' && handle !== 'end')) {
      throw new Error('ruler resize requires an endpoint handle')
    }
    return resizeRuler(layer, handle, point, options)
  }
  if (handle === 'start' || handle === 'end') {
    throw new Error(`${layer.kind} does not support endpoint resize`)
  }
  if (!layerIntrinsicResizeHandles(layer).includes(handle)) {
    throw new Error(`${layer.kind} does not support ${handle} intrinsic resize`)
  }

  const local = localPoint(layer, point)
  const requested = resizedBounds(layer.localBounds, handle, local, options)

  if (layer.kind === 'text') return resizeText(layer, requested)

  if (layer.kind === 'emoji') {
    return Object.freeze({
      ...layer,
      localBounds: squareBounds(
        layer.localBounds,
        requested,
        handle,
        options.fromCenter === true,
      ),
    })
  }

  if (layer.kind === 'loupe')
    return resizeLoupe(layer, requested, handle, options)

  if (layer.kind === 'pencil' || layer.kind === 'marker')
    return resizePointLayer(layer, requested)

  if (layer.kind === 'censor' && layer.payload.region.kind === 'freeform')
    return resizeFreeformCensor(layer, requested)

  if (
    layer.kind === 'shape' ||
    layer.kind === 'spotlight' ||
    layer.kind === 'censor'
  ) {
    return Object.freeze({ ...layer, localBounds: requested }) as LayerNode
  }

  throw new Error(`${layer.kind} does not support intrinsic bounds resize`)
}
