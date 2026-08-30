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
import { canvasFont, cssBlendMode, cssColor, withTransform } from './paint'
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

export function pixelateImageData(image: ImageData, blockSize: number): void {
  const source = new Uint8ClampedArray(image.data)
  for (let y = 0; y < image.height; y += blockSize) {
    const sampleY = Math.min(image.height - 1, y + Math.floor(blockSize / 2))
    for (let x = 0; x < image.width; x += blockSize) {
      const sampleX = Math.min(image.width - 1, x + Math.floor(blockSize / 2))
      const sampleOffset = (sampleY * image.width + sampleX) * 4
      const edgeX = Math.min(image.width, x + blockSize)
      const edgeY = Math.min(image.height, y + blockSize)
      for (let targetY = y; targetY < edgeY; targetY += 1) {
        for (let targetX = x; targetX < edgeX; targetX += 1) {
          const targetOffset = (targetY * image.width + targetX) * 4
          image.data[targetOffset] = source[sampleOffset]!
          image.data[targetOffset + 1] = source[sampleOffset + 1]!
          image.data[targetOffset + 2] = source[sampleOffset + 2]!
          image.data[targetOffset + 3] = source[sampleOffset + 3]!
        }
      }
    }
  }
}

/** Deterministic separable box blur. CanvasKit uses a Gaussian filter, so
 * cross-backend assertions intentionally use a documented pixel tolerance. */
export function blurImageData(image: ImageData, radius: number): void {
  const width = image.width
  const height = image.height
  const source = new Uint8ClampedArray(image.data)
  const horizontal = new Float64Array(source.length)
  const window = radius * 2 + 1
  for (let y = 0; y < height; y += 1) {
    const sums = [0, 0, 0, 0]
    for (let sampleX = -radius; sampleX <= radius; sampleX += 1) {
      const x = Math.max(0, Math.min(width - 1, sampleX))
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! += source[offset + channel]!
      }
    }
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        horizontal[offset + channel] = sums[channel]! / window
      }
      const removeX = Math.max(0, x - radius)
      const addX = Math.min(width - 1, x + radius + 1)
      const removeOffset = (y * width + removeX) * 4
      const addOffset = (y * width + addX) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! +=
          source[addOffset + channel]! - source[removeOffset + channel]!
      }
    }
  }
  for (let x = 0; x < width; x += 1) {
    const sums = [0, 0, 0, 0]
    for (let sampleY = -radius; sampleY <= radius; sampleY += 1) {
      const y = Math.max(0, Math.min(height - 1, sampleY))
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! += horizontal[offset + channel]!
      }
    }
    for (let y = 0; y < height; y += 1) {
      const offset = (y * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        image.data[offset + channel] = Math.round(sums[channel]! / window)
      }
      const removeY = Math.max(0, y - radius)
      const addY = Math.min(height - 1, y + radius + 1)
      const removeOffset = (removeY * width + x) * 4
      const addOffset = (addY * width + x) * 4
      for (let channel = 0; channel < 4; channel += 1) {
        sums[channel]! +=
          horizontal[addOffset + channel]! - horizontal[removeOffset + channel]!
      }
    }
  }
}

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
          x:
            node.region.points.reduce((sum, point) => sum + point.x, 0) /
            node.region.points.length,
          y:
            node.region.points.reduce((sum, point) => sum + point.y, 0) /
            node.region.points.length,
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

  const processed = copyCanvas(factory, canvas)
  const processedContext = processed.getContext('2d')
  if (!processedContext)
    throw new Error('Canvas2D censor context is unavailable')
  const image = processedContext.getImageData(
    0,
    0,
    processed.width,
    processed.height,
  )
  if (node.effect.mode === 'pixelate') {
    pixelateImageData(
      image,
      Math.max(1, Math.round(node.effect.blockSize * scale)),
    )
  } else {
    blurImageData(
      image,
      Math.max(1, Math.round((node.effect.strength * scale) / 2)),
    )
  }
  processedContext.putImageData(image, 0, 0)
  withTransform(context, node, center.x, center.y, () => {
    censorRegionPath(context, node)
    context.clip()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(processed as unknown as CanvasImageSource, 0, 0)
  })
}

export function drawSpotlight2D(
  context: Context2D,
  canvas: Canvas2DLike,
  scene: RenderSceneSnapshot,
  node: RenderSpotlightNode,
  scale: number,
  factory: (width: number, height: number) => Canvas2DLike,
): void {
  const below = copyCanvas(factory, canvas)
  context.save()
  context.globalAlpha = node.opacity * node.dimOpacity
  context.globalCompositeOperation = cssBlendMode(node.blendMode)
  context.fillStyle = cssColor(node.dimColor)
  context.fillRect(0, 0, scene.width, scene.height)
  context.restore()

  const centerX = node.aperture.x + node.aperture.width / 2
  const centerY = node.aperture.y + node.aperture.height / 2
  withTransform(context, node, centerX, centerY, () => {
    spotlightAperturePath(context, node)
    context.clip()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.globalAlpha = 1
    context.globalCompositeOperation = 'copy'
    context.drawImage(below as unknown as CanvasImageSource, 0, 0)
  })

  const feather = spotlightFeatherWidth(node.feather)
  if (feather === 0) return
  withTransform(context, node, centerX, centerY, () => {
    spotlightAperturePath(context, node)
    context.globalAlpha = node.opacity * node.dimOpacity * 0.42
    context.strokeStyle = cssColor(node.dimColor)
    context.lineWidth = feather * 0.72
    context.shadowColor = cssColor({ ...node.dimColor, alpha: 0.75 })
    context.shadowBlur = feather * scale
    context.stroke()
  })
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
      context.moveTo(
        endpoint.x - perpendicular.x * tickHalf,
        endpoint.y - perpendicular.y * tickHalf,
      )
      context.lineTo(
        endpoint.x + perpendicular.x * tickHalf,
        endpoint.y + perpendicular.y * tickHalf,
      )
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
    roundedRectPath(
      context,
      -badge.width / 2,
      -badge.height / 2,
      badge.width,
      badge.height,
      badge.radius,
    )
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
    context.lineWidth = 3
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
      const destinationX =
        node.lens.x + (sourceIntersection.x - node.sourceRegion.x) * node.zoom
      const destinationY =
        node.lens.y + (sourceIntersection.y - node.sourceRegion.y) * node.zoom
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
