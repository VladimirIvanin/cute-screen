import type {
  RgbaColor,
  RenderLineNode,
  RenderNode,
  RenderPaint,
  RenderPathNode,
} from './contracts'

export function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${field} must be finite`)
}

export function assertPositive(value: number, field: string): void {
  assertFinite(value, field)
  if (value <= 0) throw new RangeError(`${field} must be positive`)
}

export function assertNonNegative(value: number, field: string): void {
  assertFinite(value, field)
  if (value < 0) throw new RangeError(`${field} must be non-negative`)
}

export function freezeColor(color: RgbaColor): RgbaColor {
  const channels = [
    ['red', color.red],
    ['green', color.green],
    ['blue', color.blue],
    ['alpha', color.alpha],
  ] as const
  for (const [channel, value] of channels) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${channel} color channel must be between 0 and 1`)
    }
  }
  return Object.freeze({ ...color })
}

function isSolidPaint(paint: RenderPaint): paint is RgbaColor {
  return !('kind' in paint)
}

export function freezePaint(paint: RenderPaint, field: string): RenderPaint {
  if (isSolidPaint(paint)) return freezeColor(paint)
  if (paint.kind === 'imageTexture') {
    if (!paint.resourceId) throw new RangeError(`${field}.resourceId is empty`)
    for (const [name, value] of Object.entries({
      opacity: paint.opacity,
      scale: paint.scale,
      rotation: paint.rotation,
      offsetX: paint.offsetX,
      offsetY: paint.offsetY,
    })) {
      assertFinite(value, `${field}.${name}`)
    }
    if (paint.opacity < 0 || paint.opacity > 1 || paint.scale <= 0) {
      throw new RangeError(`${field} image texture values are invalid`)
    }
    return Object.freeze({ ...paint })
  }
  if (paint.kind === 'linearGradient') {
    for (const [name, value] of Object.entries({
      startX: paint.startX,
      startY: paint.startY,
      endX: paint.endX,
      endY: paint.endY,
    })) {
      assertFinite(value, `${field}.${name}`)
    }
  } else {
    assertFinite(paint.centerX, `${field}.centerX`)
    assertFinite(paint.centerY, `${field}.centerY`)
    assertPositive(paint.radius, `${field}.radius`)
  }
  if (paint.stops.length < 2 || paint.stops.length > 8) {
    throw new RangeError(`${field}.stops must contain 2 to 8 entries`)
  }
  let previous = -1
  const stops = paint.stops.map((stop, index) => {
    if (
      !Number.isFinite(stop.position) ||
      stop.position < 0 ||
      stop.position > 1 ||
      stop.position < previous
    ) {
      throw new RangeError(`${field}.stops[${index}].position is invalid`)
    }
    previous = stop.position
    return Object.freeze({
      position: stop.position,
      color: freezeColor(stop.color),
    })
  })
  return Object.freeze({ ...paint, stops: Object.freeze(stops) })
}

export function validateStrokeStyle(
  node: RenderLineNode | RenderPathNode,
): void {
  if (node.lineCap && !['butt', 'round', 'square'].includes(node.lineCap))
    throw new RangeError(`${node.id}.lineCap is invalid`)
  if (node.lineJoin && !['miter', 'round', 'bevel'].includes(node.lineJoin))
    throw new RangeError(`${node.id}.lineJoin is invalid`)
  if (node.dash) {
    if (
      node.dash.length === 0 ||
      node.dash.some((value) => !Number.isFinite(value) || value <= 0)
    ) {
      throw new RangeError(`${node.id}.dash is invalid`)
    }
  }
}

export function assertNodeBase(node: RenderNode): void {
  if (!node.id) throw new Error('Render node id must not be empty')
  assertFinite(node.rotation, `${node.id}.rotation`)
  if (node.scaleX !== undefined) assertFinite(node.scaleX, `${node.id}.scaleX`)
  if (node.scaleY !== undefined) assertFinite(node.scaleY, `${node.id}.scaleY`)
  if (node.scaleX === 0 || node.scaleY === 0) {
    throw new RangeError(`Render node ${node.id} scale must not be zero`)
  }
  if (
    (node.transformOriginX === undefined) !==
    (node.transformOriginY === undefined)
  ) {
    throw new RangeError(
      `Render node ${node.id} transform origin must contain both coordinates`,
    )
  }
  if (node.transformOriginX !== undefined) {
    assertFinite(node.transformOriginX, `${node.id}.transformOriginX`)
    assertFinite(node.transformOriginY!, `${node.id}.transformOriginY`)
  }
  if (!Number.isFinite(node.opacity) || node.opacity < 0 || node.opacity > 1) {
    throw new RangeError(
      `Render node ${node.id} opacity must be between 0 and 1`,
    )
  }
}
