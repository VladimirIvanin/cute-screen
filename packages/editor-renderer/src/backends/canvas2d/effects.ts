import {
  EffectCache,
  finishSteps,
} from '../../effects/runtime'
import { drawCensorTiles } from '../../effects/censor'
import type {
  RenderCensorNode,
  RenderLoupeNode,
  RenderRulerNode,
  RenderSceneSnapshot,
  RenderSpotlightNode,
  RenderTextStyle,
} from '@cute-screen/editor-core'
import {
  formatRulerDisplayLabel,
  intersectPixelRects,
  loupeConnectorGeometry,
  rulerBadgeBox,
  rulerBadgePalette,
  rulerBadgeRotationDegrees,
  rulerEndpointTickHalfLength,
  rulerWorldEndpoints,
  spotlightFeatherWidth,
} from '../../precision-rendering'
import type {
  Canvas2DLike,
  Canvas2DRendererOptions,
  Context2D,
} from './contracts'
import {
  canvasFont,
  cssBlendMode,
  cssColor,
  withTransform,
} from './paint'
import {
  censorRegionPath,
  loupeLensPath,
  roundedRectPath,
  spotlightAperturePath,
} from './paths'

export function copyCanvas(
  factory: (width: number, height: number) => Canvas2DLike,
  source: Canvas2DLike,
): Canvas2DLike {
  const copy = factory(source.width, source.height)
  const context = copy.getContext('2d')
  if (!context) throw new Error('Canvas2D scratch context is unavailable')
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, copy.width, copy.height)
  context.drawImage(source as unknown as CanvasImageSource, 0, 0)
  return copy
}

export {
  blurPixels as blurImageData,
  pixelatePixels as pixelateImageData,
} from '../../effects/pixels'

export function drawCensor2D(
  context: Context2D,
  canvas: Canvas2DLike,
  node: RenderCensorNode,
  scale: number,
  factory: (width: number, height: number) => Canvas2DLike,
): void {
  const center =
    node.region.kind === 'rectangle'
      ? {
          x: node.region.x + node.region.width / 2,
          y: node.region.y + node.region.height / 2,
        }
      : {
          x: node.region.points.reduce((sum, point) => sum + point.x, 0) / node.region.points.length,
          y: node.region.points.reduce((sum, point) => sum + point.y, 0) / node.region.points.length,
        }
  if (node.effect.mode === 'solid') {
    const effect = node.effect
    withTransform(context, node, center.x, center.y, () => {
      censorRegionPath(context, node)
      context.fillStyle = cssColor(effect.color)
      context.fill()
    })
    return
  }

  const cache = new EffectCache()
  try {
    finishSteps(drawCensorTiles(context, canvas, node, scale, factory, cache, 'standalone'))
  } finally {
    cache.clear()
  }
}

export function drawSpotlight2D(
  context: Context2D,
  canvas: Canvas2DLike,
  scene: RenderSceneSnapshot,
  node: RenderSpotlightNode,
  scale: number,
  factory: (width: number, height: number) => Canvas2DLike,
): void {
  // Build the union coverage first; erasing the shared dim surface avoids
  // darkening overlapping apertures or drawing internal feather seams.
  const dim = factory(canvas.width, canvas.height)
  const dimContext = dim.getContext('2d')
  const mask = factory(canvas.width, canvas.height)
  const maskContext = mask.getContext('2d')
  if (!dimContext || !maskContext) throw new Error('Spotlight mask context unavailable')
  dimContext.fillStyle = cssColor(node.dimColor)
  dimContext.globalAlpha = node.opacity * node.dimOpacity
  dimContext.fillRect(0, 0, dim.width, dim.height)
  const matrix = context.getTransform()
  maskContext.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f)
  const centerX = node.bounds.x + node.bounds.width / 2
  const centerY = node.bounds.y + node.bounds.height / 2
  withTransform(maskContext, { ...node, opacity: 1, blendMode: 'normal' }, centerX, centerY, () => {
    spotlightAperturePath(maskContext, node)
    maskContext.fillStyle = '#ffffff'
    maskContext.fill()
  })
  dimContext.globalAlpha = 1
  dimContext.globalCompositeOperation = 'destination-out'
  const feather = spotlightFeatherWidth(node.feather) * scale
  if (feather > 0) {
    // Read only the transformed union bounds plus the blur support. The alpha
    // blur is independent of CSS filters and remains usable in older WebKit.
    const radians = node.rotation * Math.PI / 180
    const originX = node.transformOriginX ?? centerX
    const originY = node.transformOriginY ?? centerY
    const corners = [[node.bounds.x,
      node.bounds.y],
    [node.bounds.x + node.bounds.width,
      node.bounds.y],
    [node.bounds.x,
      node.bounds.y + node.bounds.height],
    [node.bounds.x + node.bounds.width,
      node.bounds.y + node.bounds.height]].map(([x,
      y]) => {
      const dx = (x! - originX) * (node.scaleX ?? 1)
      const dy = (y! - originY) * (node.scaleY ?? 1)
      const worldX = originX + dx * Math.cos(radians) - dy * Math.sin(radians)
      const worldY = originY + dx * Math.sin(radians) + dy * Math.cos(radians)
      return { x: matrix.a * worldX + matrix.c * worldY + matrix.e,
        y: matrix.b * worldX + matrix.d * worldY + matrix.f }
    })
    const radius = Math.max(1, Math.ceil(feather / 2))
    const x = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.x)) - radius))
    const y = Math.max(0, Math.floor(Math.min(...corners.map((point) => point.y)) - radius))
    const right = Math.min(mask.width, Math.ceil(Math.max(...corners.map((point) => point.x)) + radius))
    const bottom = Math.min(mask.height, Math.ceil(Math.max(...corners.map((point) => point.y)) + radius))
    if (right > x && bottom > y) {
      maskContext.setTransform(1, 0, 0, 1, 0, 0)
      const image = maskContext.getImageData(x, y, right - x, bottom - y)
      blurSpotlightAlpha(image, radius)
      maskContext.putImageData(image, x, y)
    }
  }
  dimContext.drawImage(mask as unknown as CanvasImageSource, 0, 0)
  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalAlpha = 1
  context.globalCompositeOperation = cssBlendMode(node.blendMode)
  context.drawImage(dim as unknown as CanvasImageSource, 0, 0)
  context.restore()
}

export function drawRuler2D(
  context: Context2D,
  node: RenderRulerNode,
  resolveFontFamily: NonNullable<Canvas2DRendererOptions['resolveFontFamily']>,
): void {
  const centerX = (node.x1 + node.x2) / 2
  const centerY = (node.y1 + node.y2) / 2
  const label = formatRulerDisplayLabel(node)
  const labelStyle: RenderTextStyle = {
    fontFamily: 'Roboto',
    fontSize: node.fontSize,
    color: rulerBadgePalette(node.color).text,
    fontWeight: 600,
    fontStyle: 'normal',
    strikethrough: false,
  }
  withTransform(context, node, centerX, centerY, () => {
    const dx = node.x2 - node.x1
    const dy = node.y2 - node.y1
    const length = Math.hypot(dx, dy)
    const perpendicular = { x: -dy / length, y: dx / length }
    const tickHalf = rulerEndpointTickHalfLength(node.thickness)
    context.beginPath()
    context.moveTo(node.x1, node.y1)
    context.lineTo(node.x2, node.y2)
    context.strokeStyle = cssColor(node.color)
    context.lineWidth = node.thickness
    context.lineCap = 'butt'
    context.stroke()
    for (const endpoint of [
      { x: node.x1, y: node.y1 },
      { x: node.x2, y: node.y2 },
    ]) {
      context.beginPath()
      context.moveTo(endpoint.x - perpendicular.x * tickHalf, endpoint.y - perpendicular.y * tickHalf)
      context.lineTo(endpoint.x + perpendicular.x * tickHalf, endpoint.y + perpendicular.y * tickHalf)
      context.stroke()
    }
  })
  const endpoints = rulerWorldEndpoints(node)
  const badgeCenterX = (endpoints.start.x + endpoints.end.x) / 2
  const badgeCenterY = (endpoints.start.y + endpoints.end.y) / 2
  context.save()
  try {
    context.globalAlpha = node.opacity
    context.globalCompositeOperation = cssBlendMode(node.blendMode)
    context.font = canvasFont(labelStyle, resolveFontFamily(label, labelStyle))
    const metrics = context.measureText(label)
    const badge = rulerBadgeBox(metrics.width, node.fontSize)
    const palette = rulerBadgePalette(node.color)
    const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
      ? metrics.actualBoundingBoxAscent
      : node.fontSize * 0.8
    const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
      ? metrics.actualBoundingBoxDescent
      : node.fontSize * 0.2
    context.translate(badgeCenterX, badgeCenterY)
    context.rotate((rulerBadgeRotationDegrees(node) * Math.PI) / 180)
    roundedRectPath(context, -badge.width / 2, -badge.height / 2, badge.width, badge.height, badge.radius)
    context.fillStyle = cssColor(palette.background)
    context.fill()
    context.strokeStyle = cssColor(node.color)
    context.lineWidth = 1
    context.stroke()
    context.textAlign = 'center'
    context.textBaseline = 'alphabetic'
    context.fillStyle = cssColor(palette.text)
    context.fillText(label, 0, (ascent - descent) / 2)
  } finally {
    context.restore()
  }
}

export function drawLoupe2D(
  context: Context2D,
  canvas: Canvas2DLike,
  scene: RenderSceneSnapshot,
  node: RenderLoupeNode,
  scale: number,
  factory: (width: number, height: number) => Canvas2DLike,
): void {
  const below = copyCanvas(factory, canvas)
  const radius = node.lens.size / 2
  const centerX = node.lens.x + radius
  const centerY = node.lens.y + radius
  const connector = loupeConnectorGeometry(node)
  if (connector) {
    context.save()
    context.globalAlpha = node.opacity
    context.globalCompositeOperation = cssBlendMode(node.blendMode)
    context.strokeStyle = cssColor(node.border.color)
    context.fillStyle = cssColor(node.border.color)
    context.lineWidth = connector.lineWidth
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.shadowColor = 'rgba(0, 0, 0, 0.3)'
    context.shadowBlur = 6 * scale
    context.beginPath()
    context.moveTo(connector.lensCenter.x, connector.lensCenter.y)
    context.lineTo(connector.lineEnd.x, connector.lineEnd.y)
    context.stroke()
    context.shadowColor = 'rgba(0, 0, 0, 0)'
    context.beginPath()
    context.moveTo(connector.source.x, connector.source.y)
    context.lineTo(connector.arrowLeft.x, connector.arrowLeft.y)
    context.lineTo(connector.arrowRight.x, connector.arrowRight.y)
    context.closePath()
    context.fill()
    context.restore()
  }
  withTransform(context, node, centerX, centerY, () => {
    if (node.shadow) {
      loupeLensPath(context, node)
      context.strokeStyle = cssColor(node.shadow.color)
      context.lineWidth = Math.max(1, node.border.width)
      context.shadowColor = cssColor(node.shadow.color)
      context.shadowOffsetX = node.shadow.offsetX * scale
      context.shadowOffsetY = node.shadow.offsetY * scale
      context.shadowBlur = node.shadow.blur * scale
      context.stroke()
      context.shadowColor = 'rgba(0, 0, 0, 0)'
      context.shadowOffsetX = 0
      context.shadowOffsetY = 0
      context.shadowBlur = 0
    }

    context.save()
    loupeLensPath(context, node)
    context.clip()
    context.save()
    context.globalAlpha = 1
    context.globalCompositeOperation = 'copy'
    context.fillStyle = 'rgba(0, 0, 0, 0)'
    context.fillRect(node.lens.x, node.lens.y, node.lens.size, node.lens.size)
    context.restore()
    // The lens starts as transparent black; only its source/canvas intersection
    // is populated from the frozen composite below.
    const sourceIntersection = intersectPixelRects(node.sourceRegion, {
      x: 0,
      y: 0,
      width: scene.width,
      height: scene.height,
    })
    if (sourceIntersection) {
      const destinationX = node.lens.x + (sourceIntersection.x - node.sourceRegion.x) * node.zoom
      const destinationY = node.lens.y + (sourceIntersection.y - node.sourceRegion.y) * node.zoom
      context.imageSmoothingEnabled = false
      context.drawImage(
        below as unknown as CanvasImageSource,
        sourceIntersection.x * scale,
        sourceIntersection.y * scale,
        sourceIntersection.width * scale,
        sourceIntersection.height * scale,
        destinationX,
        destinationY,
        sourceIntersection.width * node.zoom,
        sourceIntersection.height * node.zoom,
      )
    }
    context.restore()

    if (node.border.width > 0) {
      loupeLensPath(context, node)
      context.strokeStyle = cssColor(node.border.color)
      context.lineWidth = node.border.width
      context.stroke()
    }
  })
}

/** Separable alpha-only box blur, with one byte of scratch per mask pixel. */
function blurSpotlightAlpha(
  image: ImageData,
  radius: number,
): void {
  const { width, height, data } = image
  const horizontal = new Uint8ClampedArray(width * height)
  const window = radius * 2 + 1
  for (let y = 0; y < height; y++) {
    let sum = 0
    for (let offset = -radius; offset <= radius; offset++) sum += data[(y * width + Math.max(0,
      Math.min(width - 1,
        offset))) * 4 + 3]!
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / window
      sum += data[(y * width + Math.min(width - 1,
        x + radius + 1)) * 4 + 3]! - data[(y * width + Math.max(0,
        x - radius)) * 4 + 3]!
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0
    for (let offset = -radius; offset <= radius; offset++) sum += horizontal[Math.max(0,
      Math.min(height - 1,
        offset)) * width + x]!
    for (let y = 0; y < height; y++) {
      data[(y * width + x) * 4 + 3] = sum / window
      sum += horizontal[Math.min(height - 1,
        y + radius + 1) * width + x]! - horizontal[Math.max(0,
        y - radius) * width + x]!
    }
  }
}
