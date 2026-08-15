import type {
  RenderLoupeNode,
  RenderOutputBounds,
  RenderRulerNode,
  RgbaColor,
} from '@cute-screen/editor-core'

export interface PixelRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface LoupeConnectorGeometry {
  readonly source: Readonly<{ readonly x: number; readonly y: number }>
  readonly lensCenter: Readonly<{ readonly x: number; readonly y: number }>
  readonly lineEnd: Readonly<{ readonly x: number; readonly y: number }>
  readonly arrowLeft: Readonly<{ readonly x: number; readonly y: number }>
  readonly arrowRight: Readonly<{ readonly x: number; readonly y: number }>
}

/** Derived callout geometry; it is intentionally not part of the persisted v7 schema. */
export function loupeConnectorGeometry(
  node: RenderLoupeNode,
): LoupeConnectorGeometry | null {
  const source = {
    x: node.sourceRegion.x + node.sourceRegion.width / 2,
    y: node.sourceRegion.y + node.sourceRegion.height / 2,
  }
  const lensCenter = {
    x: node.lens.x + node.lens.size / 2,
    y: node.lens.y + node.lens.size / 2,
  }
  const dx = source.x - lensCenter.x
  const dy = source.y - lensCenter.y
  const distance = Math.hypot(dx, dy)
  const radius = node.lens.size / 2
  const sourceInsideLens =
    node.lens.shape === 'circle'
      ? distance <= radius
      : Math.abs(dx) <= radius && Math.abs(dy) <= radius
  if (sourceInsideLens || distance === 0) return null

  const direction = { x: dx / distance, y: dy / distance }
  const perpendicular = { x: -direction.y, y: direction.x }
  const arrowLength = Math.max(8, Math.min(12, node.lens.size * 0.12))
  const arrowHalfWidth = arrowLength * 0.45
  const lineEnd = {
    x: source.x - direction.x * (arrowLength * 0.35),
    y: source.y - direction.y * (arrowLength * 0.35),
  }
  const arrowBase = {
    x: source.x - direction.x * arrowLength,
    y: source.y - direction.y * arrowLength,
  }
  return Object.freeze({
    source: Object.freeze(source),
    lensCenter: Object.freeze(lensCenter),
    lineEnd: Object.freeze(lineEnd),
    arrowLeft: Object.freeze({
      x: arrowBase.x + perpendicular.x * arrowHalfWidth,
      y: arrowBase.y + perpendicular.y * arrowHalfWidth,
    }),
    arrowRight: Object.freeze({
      x: arrowBase.x - perpendicular.x * arrowHalfWidth,
      y: arrowBase.y - perpendicular.y * arrowHalfWidth,
    }),
  })
}

export function formatRulerDisplayLabel(node: RenderRulerNode): string {
  return node.label
}

export function rulerEndpointTickHalfLength(thickness: number): number {
  return Math.max(6, Math.min(12, thickness))
}

export function rulerBadgeRotationDegrees(
  node: RulerTransformGeometry,
): number {
  const endpoints = rulerWorldEndpoints(node)
  let angle =
    (Math.atan2(
      endpoints.end.y - endpoints.start.y,
      endpoints.end.x - endpoints.start.x,
    ) *
      180) /
    Math.PI
  if (angle > 90) angle -= 180
  if (angle < -90) angle += 180
  return Object.is(angle, -0) ? 0 : angle
}

export function rulerWorldEndpoints(node: RulerTransformGeometry): Readonly<{
  readonly start: Readonly<{ readonly x: number; readonly y: number }>
  readonly end: Readonly<{ readonly x: number; readonly y: number }>
}> {
  const centerX = (node.x1 + node.x2) / 2
  const centerY = (node.y1 + node.y2) / 2
  const originX = node.transformOriginX ?? centerX
  const originY = node.transformOriginY ?? centerY
  const scaleX = node.scaleX ?? 1
  const scaleY = node.scaleY ?? 1
  const radians = ((node.rotation ?? 0) * Math.PI) / 180
  const cosine = Math.cos(radians)
  const sine = Math.sin(radians)
  const transform = (x: number, y: number) => {
    const scaledX = (x - originX) * scaleX
    const scaledY = (y - originY) * scaleY
    return Object.freeze({
      x: originX + cosine * scaledX - sine * scaledY,
      y: originY + sine * scaledX + cosine * scaledY,
    })
  }
  return Object.freeze({
    start: transform(node.x1, node.y1),
    end: transform(node.x2, node.y2),
  })
}

type RulerTransformGeometry = Pick<RenderRulerNode, 'x1' | 'y1' | 'x2' | 'y2'> &
  Partial<
    Pick<
      RenderRulerNode,
      'rotation' | 'scaleX' | 'scaleY' | 'transformOriginX' | 'transformOriginY'
    >
  >

function linearized(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4
}

export function rulerBadgePalette(color: RgbaColor): Readonly<{
  readonly background: RgbaColor
  readonly text: RgbaColor
}> {
  const luminance =
    linearized(color.red) * 0.2126 +
    linearized(color.green) * 0.7152 +
    linearized(color.blue) * 0.0722
  return luminance >= 0.55
    ? {
        background: { red: 0.08, green: 0.07, blue: 0.09, alpha: 0.94 },
        text: { red: 1, green: 1, blue: 1, alpha: 1 },
      }
    : {
        background: { red: 1, green: 1, blue: 1, alpha: 0.96 },
        text: { red: 0.08, green: 0.07, blue: 0.09, alpha: 1 },
      }
}

export function rulerBadgeBox(
  textWidth: number,
  fontSize: number,
): Readonly<{ width: number; height: number; radius: number }> {
  const height = fontSize + 8
  const width = Math.max(height, textWidth + Math.max(12, fontSize * 0.9))
  return { width, height, radius: Math.min(6, height / 2) }
}

export function spotlightFeatherWidth(
  preset: 'soft' | 'strong' | null,
): number {
  if (preset === 'soft') return 6
  if (preset === 'strong') return 14
  return 0
}

export function intersectPixelRects(
  left: PixelRect,
  right: PixelRect,
): PixelRect | null {
  const x = Math.max(left.x, right.x)
  const y = Math.max(left.y, right.y)
  const edgeX = Math.min(left.x + left.width, right.x + right.width)
  const edgeY = Math.min(left.y + left.height, right.y + right.height)
  if (edgeX <= x || edgeY <= y) return null
  return { x, y, width: edgeX - x, height: edgeY - y }
}

export function scaledOutputSize(
  bounds: RenderOutputBounds,
  scale: number,
): Readonly<{ width: number; height: number }> {
  if (!Number.isFinite(scale) || scale <= 0 || scale > 16) {
    throw new RangeError(
      'export scale must be finite, greater than 0 and at most 16',
    )
  }
  return {
    width: Math.max(1, Math.round(bounds.width * scale)),
    height: Math.max(1, Math.round(bounds.height * scale)),
  }
}
