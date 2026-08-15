import type {
  RenderNode,
  RenderPaint,
  RenderCensorNode,
  RenderLoupeNode,
  RenderRulerNode,
  RenderSceneSnapshot,
  RenderSpotlightNode,
  RenderTextStyle,
  RgbaColor,
} from '@cute-screen/editor-core'

import { layoutRichText } from './rich-text-layout'
import {
  formatRulerDisplayLabel,
  intersectPixelRects,
  loupeConnectorGeometry,
  rulerBadgeBox,
  rulerBadgePalette,
  rulerBadgeRotationDegrees,
  rulerEndpointTickHalfLength,
  rulerWorldEndpoints,
  scaledOutputSize,
  spotlightFeatherWidth,
} from './precision-rendering'
import type { InvalidationReason } from './scheduler'
import type {
  CanvasStack,
  FrameMetric,
  ImageResource,
  ImageResourceInput,
  Renderer,
  RenderExportOptions,
} from './types'

type Context2D = Pick<
  CanvasRenderingContext2D,
  | 'clearRect'
  | 'drawImage'
  | 'getImageData'
  | 'putImageData'
  | 'fillRect'
  | 'strokeRect'
  | 'beginPath'
  | 'ellipse'
  | 'moveTo'
  | 'lineTo'
  | 'closePath'
  | 'rect'
  | 'clip'
  | 'quadraticCurveTo'
  | 'fill'
  | 'stroke'
  | 'save'
  | 'restore'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'setTransform'
  | 'globalAlpha'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'globalCompositeOperation'
  | 'createLinearGradient'
  | 'createRadialGradient'
  | 'createPattern'
  | 'setLineDash'
  | 'fillText'
  | 'strokeText'
  | 'measureText'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
  | 'shadowColor'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'shadowBlur'
  | 'imageSmoothingEnabled'
>

export interface Canvas2DLike {
  width: number
  height: number
  getContext(type: '2d'): Context2D | null
  toBlob?: (callback: BlobCallback, type?: string) => void
  encode?: (format: 'png') => Promise<Uint8Array>
}

interface Canvas2DImageResource extends ImageResource {
  readonly source: ImageResourceInput['source']
}

export interface Canvas2DRendererOptions {
  readonly now?: () => number
  readonly exportCanvas?: (width: number, height: number) => Canvas2DLike
  /** Mirrors browser unicode-range font selection in deterministic headless tests. */
  readonly resolveFontFamily?: (text: string, style: RenderTextStyle) => string
}

function defaultCanvas(width: number, height: number): Canvas2DLike {
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height) as unknown as Canvas2DLike
  }
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    return canvas
  }
  throw new Error('Canvas2D scratch surface is unavailable')
}

function cssColor(color: RgbaColor): string {
  return `rgba(${Math.round(color.red * 255)}, ${Math.round(
    color.green * 255,
  )}, ${Math.round(color.blue * 255)}, ${color.alpha})`
}

function cssBlendMode(mode: RenderNode['blendMode']): GlobalCompositeOperation {
  switch (mode) {
    case 'multiply':
      return 'multiply'
    case 'screen':
      return 'screen'
    case 'overlay':
      return 'overlay'
    case 'darken':
      return 'darken'
    case 'lighten':
      return 'lighten'
    case 'softLight':
      return 'soft-light'
    case 'hardLight':
      return 'hard-light'
    default:
      return 'source-over'
  }
}

function paintStyle(
  context: Context2D,
  paint: RenderPaint,
  resources: ReadonlyMap<string, ImageResourceInput['source']> = new Map(),
): string | CanvasGradient | CanvasPattern {
  if (!('kind' in paint)) return cssColor(paint)
  if (paint.kind === 'imageTexture') {
    const resource = resources.get(paint.resourceId)
    if (!resource) return 'rgba(229, 72, 77, 0.16)'
    const pattern = context.createPattern(resource, 'repeat')
    if (!pattern) return 'rgba(229, 72, 77, 0.16)'
    if (
      typeof pattern.setTransform === 'function' &&
      typeof DOMMatrix !== 'undefined'
    ) {
      const transform = new DOMMatrix()
        .translate(paint.offsetX, paint.offsetY)
        .rotate(paint.rotation)
        .scale(paint.scale)
      pattern.setTransform(transform)
    }
    return pattern
  }
  const gradient =
    paint.kind === 'linearGradient'
      ? context.createLinearGradient(
          paint.startX,
          paint.startY,
          paint.endX,
          paint.endY,
        )
      : context.createRadialGradient(
          paint.centerX,
          paint.centerY,
          0,
          paint.centerX,
          paint.centerY,
          paint.radius,
        )
  for (const stop of paint.stops)
    gradient.addColorStop(stop.position, cssColor(stop.color))
  return gradient
}

function canvasFont(style: RenderTextStyle, fontFamily: string): string {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px "${fontFamily.replaceAll('"', '')}", sans-serif`
}

function withTransform(
  context: Context2D,
  node: RenderNode,
  centerX: number,
  centerY: number,
  draw: () => void,
): void {
  context.save()
  context.globalAlpha = node.opacity
  context.globalCompositeOperation = cssBlendMode(node.blendMode)
  const originX = node.transformOriginX ?? centerX
  const originY = node.transformOriginY ?? centerY
  const scaleX = node.scaleX ?? 1
  const scaleY = node.scaleY ?? 1
  if (node.rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
    context.translate(originX, originY)
    context.rotate((node.rotation * Math.PI) / 180)
    context.scale(scaleX, scaleY)
    context.translate(-originX, -originY)
  }
  draw()
  context.restore()
}

function roundedRectPath(
  context: Context2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const corner = Math.min(radius, width / 2, height / 2)
  context.beginPath()
  context.moveTo(x + corner, y)
  context.lineTo(x + width - corner, y)
  context.quadraticCurveTo(x + width, y, x + width, y + corner)
  context.lineTo(x + width, y + height - corner)
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - corner,
    y + height,
  )
  context.lineTo(x + corner, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - corner)
  context.lineTo(x, y + corner)
  context.quadraticCurveTo(x, y, x + corner, y)
  context.closePath()
}

function censorRegionPath(context: Context2D, node: RenderCensorNode): void {
  context.beginPath()
  if (node.region.kind === 'rectangle') {
    context.rect(
      node.region.x,
      node.region.y,
      node.region.width,
      node.region.height,
    )
    return
  }
  const first = node.region.points[0]!
  context.moveTo(first.x, first.y)
  for (const point of node.region.points.slice(1)) {
    context.lineTo(point.x, point.y)
  }
  context.closePath()
}

function spotlightAperturePath(
  context: Context2D,
  node: RenderSpotlightNode,
): void {
  const aperture = node.aperture
  context.beginPath()
  if (aperture.shape === 'rectangle') {
    context.rect(aperture.x, aperture.y, aperture.width, aperture.height)
  } else if (aperture.shape === 'ellipse') {
    context.ellipse(
      aperture.x + aperture.width / 2,
      aperture.y + aperture.height / 2,
      aperture.width / 2,
      aperture.height / 2,
      0,
      0,
      Math.PI * 2,
    )
  } else {
    context.moveTo(aperture.x + aperture.width / 2, aperture.y)
    context.lineTo(
      aperture.x + aperture.width,
      aperture.y + aperture.height / 2,
    )
    context.lineTo(
      aperture.x + aperture.width / 2,
      aperture.y + aperture.height,
    )
    context.lineTo(aperture.x, aperture.y + aperture.height / 2)
    context.closePath()
  }
}

function loupeLensPath(context: Context2D, node: RenderLoupeNode): void {
  context.beginPath()
  if (node.lens.shape === 'circle') {
    const radius = node.lens.size / 2
    context.ellipse(
      node.lens.x + radius,
      node.lens.y + radius,
      radius,
      radius,
      0,
      0,
      Math.PI * 2,
    )
  } else {
    context.rect(node.lens.x, node.lens.y, node.lens.size, node.lens.size)
  }
}

function copyCanvas(
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

function pixelateImageData(image: ImageData, blockSize: number): void {
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
function blurImageData(image: ImageData, radius: number): void {
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

function drawCensor2D(
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

function drawSpotlight2D(
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

function drawRuler2D(
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

function drawLoupe2D(
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

export function drawNodes2D(
  context: Context2D,
  nodes: readonly RenderNode[],
  resources: ReadonlyMap<string, ImageResourceInput['source']> = new Map(),
  resolveFontFamily: NonNullable<
    Canvas2DRendererOptions['resolveFontFamily']
  > = (_text, style) => style.fontFamily,
): void {
  for (const node of nodes) {
    if (!node.visible || node.opacity === 0) continue
    switch (node.kind) {
      case 'rect': {
        const centerX = node.x + node.width / 2
        const centerY = node.y + node.height / 2
        withTransform(context, node, centerX, centerY, () => {
          context.fillStyle = paintStyle(context, node.fill, resources)
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.lineJoin = node.lineJoin ?? 'miter'
          }
          if ((node.cornerRadius ?? 0) > 0) {
            roundedRectPath(
              context,
              node.x,
              node.y,
              node.width,
              node.height,
              node.cornerRadius ?? 0,
            )
            context.fill()
          } else {
            context.fillRect(node.x, node.y, node.width, node.height)
          }
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.lineJoin = node.lineJoin ?? 'miter'
            if ((node.cornerRadius ?? 0) > 0) context.stroke()
            else context.strokeRect(node.x, node.y, node.width, node.height)
          }
        })
        break
      }
      case 'ellipse':
        withTransform(context, node, node.centerX, node.centerY, () => {
          context.beginPath()
          context.ellipse(
            node.centerX,
            node.centerY,
            node.radiusX,
            node.radiusY,
            0,
            0,
            Math.PI * 2,
          )
          context.fillStyle = paintStyle(context, node.fill, resources)
          context.fill()
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.lineJoin = node.lineJoin ?? 'miter'
            context.stroke()
          }
        })
        break
      case 'line': {
        const centerX = (node.x1 + node.x2) / 2
        const centerY = (node.y1 + node.y2) / 2
        withTransform(context, node, centerX, centerY, () => {
          context.beginPath()
          context.moveTo(node.x1, node.y1)
          context.lineTo(node.x2, node.y2)
          context.strokeStyle = cssColor(node.stroke)
          context.lineWidth = node.strokeWidth
          context.lineCap = node.lineCap ?? 'butt'
          context.lineJoin = node.lineJoin ?? 'miter'
          context.setLineDash(node.dash ? [...node.dash] : [])
          context.stroke()
        })
        break
      }
      case 'path': {
        const centerX =
          (Math.min(...node.points.map((point) => point.x)) +
            Math.max(...node.points.map((point) => point.x))) /
          2
        const centerY =
          (Math.min(...node.points.map((point) => point.y)) +
            Math.max(...node.points.map((point) => point.y))) /
          2
        withTransform(context, node, centerX, centerY, () => {
          context.beginPath()
          context.moveTo(node.points[0]!.x, node.points[0]!.y)
          for (const point of node.points.slice(1))
            context.lineTo(point.x, point.y)
          context.strokeStyle = cssColor(node.stroke)
          context.lineWidth = node.strokeWidth
          context.lineCap = node.lineCap ?? 'butt'
          context.lineJoin = node.lineJoin ?? 'miter'
          context.setLineDash(node.dash ? [...node.dash] : [])
          context.stroke()
        })
        break
      }
      case 'polygon': {
        const first = node.points[0]!
        const centerX =
          node.points.reduce((total, point) => total + point.x, 0) /
          node.points.length
        const centerY =
          node.points.reduce((total, point) => total + point.y, 0) /
          node.points.length
        withTransform(context, node, centerX, centerY, () => {
          context.beginPath()
          context.moveTo(first.x, first.y)
          for (const point of node.points.slice(1))
            context.lineTo(point.x, point.y)
          context.closePath()
          context.fillStyle = paintStyle(context, node.fill, resources)
          context.fill()
          if (node.stroke && (node.strokeWidth ?? 0) > 0) {
            context.strokeStyle = cssColor(node.stroke)
            context.lineWidth = node.strokeWidth ?? 1
            context.lineJoin = node.lineJoin ?? 'miter'
            context.stroke()
          }
        })
        break
      }
      case 'image':
        // Image resources are resolved by the renderer; no placeholder is drawn
        // here so overlays stay independent from committed scene rendering.
        break
      case 'text': {
        const centerX = node.x + node.width / 2
        const centerY = node.y + node.height / 2
        withTransform(context, node, centerX, centerY, () => {
          const layout = layoutRichText(node, (text, style) => {
            context.font = canvasFont(style, resolveFontFamily(text, style))
            const metrics = context.measureText(text)
            const ascent = Number.isFinite(metrics.actualBoundingBoxAscent)
              ? metrics.actualBoundingBoxAscent
              : style.fontSize * 0.8
            const descent = Number.isFinite(metrics.actualBoundingBoxDescent)
              ? metrics.actualBoundingBoxDescent
              : style.fontSize * 0.2
            const lineAscent = Number.isFinite(metrics.fontBoundingBoxAscent)
              ? metrics.fontBoundingBoxAscent
              : style.fontSize * 0.8
            const lineDescent = Number.isFinite(metrics.fontBoundingBoxDescent)
              ? metrics.fontBoundingBoxDescent
              : style.fontSize * 0.2
            return {
              width: metrics.width,
              ascent,
              descent,
              lineAscent,
              lineDescent,
            }
          })
          context.textAlign = 'left'
          context.textBaseline = 'alphabetic'
          for (const line of layout.lines) {
            if (line.bullet) {
              context.beginPath()
              context.ellipse(
                line.bullet.centerX,
                line.bullet.centerY,
                line.bullet.radius,
                line.bullet.radius,
                0,
                0,
                Math.PI * 2,
              )
              context.fillStyle = cssColor(line.bullet.color)
              context.fill()
            }
            for (const fragment of line.fragments) {
              context.font = canvasFont(
                fragment,
                resolveFontFamily(fragment.text, fragment),
              )
              context.fillStyle = cssColor(fragment.color)
              context.fillText(fragment.text, fragment.x, fragment.baseline)
            }
            for (const strike of line.strikes) {
              context.beginPath()
              context.moveTo(strike.x, strike.y)
              context.lineTo(strike.x + strike.width, strike.y)
              context.strokeStyle = cssColor(strike.color)
              context.lineWidth = strike.thickness
              context.lineCap = 'butt'
              context.stroke()
            }
          }
        })
        break
      }
      case 'ruler':
        drawRuler2D(context, node, resolveFontFamily)
        break
      case 'censor':
      case 'spotlight':
      case 'loupe':
        throw new Error(
          `${node.kind} rendering requires an ordered Canvas2D surface`,
        )
    }
  }
}

export class Canvas2DRenderer implements Renderer {
  readonly backend = 'canvas2d' as const
  readonly #now: () => number
  readonly #exportCanvas?: Canvas2DRendererOptions['exportCanvas']
  readonly #resolveFontFamily: NonNullable<
    Canvas2DRendererOptions['resolveFontFamily']
  >
  readonly #resources = new Map<string, Canvas2DImageResource>()
  #stack: CanvasStack | undefined
  #scene: RenderSceneSnapshot | undefined
  #overlay: readonly RenderNode[] = []
  #disposed = false

  constructor(options: Canvas2DRendererOptions = {}) {
    this.#now = options.now ?? (() => performance.now())
    this.#exportCanvas = options.exportCanvas
    this.#resolveFontFamily =
      options.resolveFontFamily ?? ((_text, style) => style.fontFamily)
  }

  async initialize(stack: CanvasStack): Promise<void> {
    this.#assertActive()
    if (!stack.scene.getContext('2d') || !stack.overlay.getContext('2d')) {
      throw new Error('Canvas2D context is unavailable')
    }
    this.#stack = stack
  }

  async createImageResource(input: ImageResourceInput): Promise<ImageResource> {
    this.#assertActive()
    const resource: Canvas2DImageResource = {
      ...input,
      dispose: () => this.#resources.delete(input.id),
    }
    this.#resources.set(resource.id, resource)
    return resource
  }

  setScene(scene: RenderSceneSnapshot): void {
    this.#assertActive()
    this.#scene = scene
  }

  setOverlay(nodes: readonly RenderNode[]): void {
    this.#assertActive()
    this.#overlay = nodes
  }

  render(reasons: readonly InvalidationReason[]): FrameMetric {
    this.#assertReady()
    const startedAt = this.#now()
    const scene = this.#scene!
    const stack = this.#stack!
    if (
      reasons.some((reason) =>
        ['scene', 'viewport', 'resource', 'export'].includes(reason),
      )
    ) {
      this.#drawScene(stack.scene, scene)
    }
    if (reasons.includes('overlay') || reasons.includes('viewport')) {
      const bounds = scene.outputBounds
      stack.overlay.width = Math.max(1, Math.round(bounds.width))
      stack.overlay.height = Math.max(1, Math.round(bounds.height))
      const context = stack.overlay.getContext('2d')!
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, stack.overlay.width, stack.overlay.height)
      context.setTransform(1, 0, 0, 1, -bounds.x, -bounds.y)
      drawNodes2D(
        context,
        this.#overlay,
        this.#resourceSources(),
        this.#resolveFontFamily,
      )
    }
    return {
      backend: this.backend,
      correlationId: stack.correlationId,
      reasons: [...reasons],
      nodeCount: scene.nodes.length + this.#overlay.length,
      startedAt,
      duration: this.#now() - startedAt,
    }
  }

  async exportPng(options: RenderExportOptions = {}): Promise<Uint8Array> {
    this.#assertReady()
    const scene = this.#scene!
    const scale = options.scale ?? 1
    const size = scaledOutputSize(scene.outputBounds, scale)
    const target = this.#newCanvas(size.width, size.height)
    this.#drawScene(target, scene, scale)
    if (target.encode) return target.encode('png')
    return this.#blobBytes(target)
  }

  dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const resource of this.#resources.values()) resource.dispose()
    this.#resources.clear()
    this.#stack = undefined
    this.#scene = undefined
  }

  #drawScene(
    canvas: Canvas2DLike,
    scene: RenderSceneSnapshot,
    scale = 1,
  ): void {
    const outputSize = scaledOutputSize(scene.outputBounds, scale)
    const fullWidth = Math.max(1, Math.round(scene.width * scale))
    const fullHeight = Math.max(1, Math.round(scene.height * scale))
    const usesFullCanvas =
      scale === 1 &&
      scene.outputBounds.x === 0 &&
      scene.outputBounds.y === 0 &&
      scene.outputBounds.width === scene.width &&
      scene.outputBounds.height === scene.height
    const working = usesFullCanvas
      ? canvas
      : this.#newCanvas(fullWidth, fullHeight)
    working.width = fullWidth
    working.height = fullHeight
    const context = working.getContext('2d')!
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, working.width, working.height)
    context.setTransform(scale, 0, 0, scale, 0, 0)
    for (const node of scene.nodes) {
      if (!node.visible || node.opacity === 0) continue
      if (node.kind === 'censor') {
        drawCensor2D(context, working, node, scale, (width, height) =>
          this.#newCanvas(width, height),
        )
        continue
      }
      if (node.kind === 'spotlight') {
        drawSpotlight2D(context, working, scene, node, scale, (width, height) =>
          this.#newCanvas(width, height),
        )
        continue
      }
      if (node.kind === 'ruler') {
        drawRuler2D(context, node, this.#resolveFontFamily)
        continue
      }
      if (node.kind === 'loupe') {
        drawLoupe2D(context, working, scene, node, scale, (width, height) =>
          this.#newCanvas(width, height),
        )
        continue
      }
      if (node.kind !== 'image') {
        drawNodes2D(
          context,
          [node],
          this.#resourceSources(),
          this.#resolveFontFamily,
        )
        continue
      }
      const resource = this.#resources.get(node.resourceId)
      context.save()
      context.globalAlpha = node.opacity
      context.globalCompositeOperation = cssBlendMode(node.blendMode)
      context.translate(node.x, node.y)
      context.rotate((node.rotation * Math.PI) / 180)
      context.scale(node.scaleX, node.scaleY)
      if (resource) {
        if ((node.cornerRadius ?? 0) > 0) {
          roundedRectPath(
            context,
            0,
            0,
            node.width,
            node.height,
            node.cornerRadius ?? 0,
          )
          context.clip()
        }
        context.drawImage(resource.source, 0, 0, node.width, node.height)
      } else {
        // A missing blob is a recoverable per-resource failure: preserve the
        // canvas and history while making the affected bounds visible.
        // Match CanvasKit's 0.72/0.28/0.28 placeholder color exactly after
        // its 8-bit conversion, so fallback and headless output stay stable.
        context.fillStyle = 'rgba(184, 71, 71, 0.16)'
        context.strokeStyle = 'rgba(184, 71, 71, 0.9)'
        context.lineWidth = 1
        if ((node.cornerRadius ?? 0) > 0) {
          roundedRectPath(
            context,
            0,
            0,
            node.width,
            node.height,
            node.cornerRadius ?? 0,
          )
          context.fill()
          context.stroke()
        } else {
          context.fillRect(0, 0, node.width, node.height)
          context.strokeRect(0, 0, node.width, node.height)
        }
      }
      if (node.stroke && (node.strokeWidth ?? 0) > 0) {
        context.strokeStyle = cssColor(node.stroke)
        context.lineWidth = node.strokeWidth ?? 1
        context.lineJoin = node.lineJoin ?? 'miter'
        if ((node.cornerRadius ?? 0) > 0) {
          roundedRectPath(
            context,
            0,
            0,
            node.width,
            node.height,
            node.cornerRadius ?? 0,
          )
          context.stroke()
        } else {
          context.strokeRect(0, 0, node.width, node.height)
        }
      }
      context.restore()
    }
    if (working === canvas) return

    canvas.width = outputSize.width
    canvas.height = outputSize.height
    const output = canvas.getContext('2d')!
    output.setTransform(1, 0, 0, 1, 0, 0)
    output.clearRect(0, 0, canvas.width, canvas.height)
    output.drawImage(
      working as unknown as CanvasImageSource,
      scene.outputBounds.x * scale,
      scene.outputBounds.y * scale,
      scene.outputBounds.width * scale,
      scene.outputBounds.height * scale,
      0,
      0,
      outputSize.width,
      outputSize.height,
    )
  }

  #newCanvas(width: number, height: number): Canvas2DLike {
    return (this.#exportCanvas ?? defaultCanvas)(width, height)
  }

  async #blobBytes(canvas: Canvas2DLike): Promise<Uint8Array> {
    if (!canvas.toBlob) throw new Error('Canvas PNG encoding is unavailable')
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob!((value) => {
        if (value) resolve(value)
        else reject(new Error('Canvas PNG encoding failed'))
      }, 'image/png')
    })
    return new Uint8Array(await blob.arrayBuffer())
  }

  #resourceSources(): ReadonlyMap<string, ImageResourceInput['source']> {
    return new Map(
      [...this.#resources.entries()].map(([id, resource]) => [
        id,
        resource.source,
      ]),
    )
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('Canvas2D renderer is disposed')
  }

  #assertReady(): void {
    this.#assertActive()
    if (!this.#stack) throw new Error('Canvas2D renderer is not initialized')
    if (!this.#scene) throw new Error('Canvas2D renderer has no scene')
  }
}
