import type {
  RenderCensorNode,
  RenderRulerNode,
  RenderSceneSnapshot,
  RenderSpotlightNode,
} from '@cute-screen/editor-core'
import {
  formatRulerDisplayLabel,
  rulerBadgeBox,
  rulerBadgePalette,
  rulerBadgeRotationDegrees,
  rulerEndpointTickHalfLength,
  rulerWorldEndpoints,
  spotlightFeatherWidth,
} from '../../precision-rendering'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitImage,
  CanvasKitMaskFilter,
  CanvasKitPaint,
  CanvasKitSurface,
} from './contracts'
import {
  CanvasKitTypefaceStore,
  cancelNodeTransform,
  canvasKitTextWidth,
  resolveCanvasKitVisualCenterBaseline,
  withTransform,
} from './geometry'
import { blendMode, configurePaint } from './paint'
import { censorPath, spotlightPath } from './paths'

export function drawSnapshotCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  image: CanvasKitImage,
  source: Float32Array,
  destination: Float32Array,
  paint: CanvasKitPaint,
  nearest = false,
): void {
  if (canvas.drawImageRectOptions && canvasKit.FilterMode) {
    canvas.drawImageRectOptions(
      image,
      source,
      destination,
      nearest
        ? (canvasKit.FilterMode.Nearest ?? canvasKit.FilterMode.Linear)
        : canvasKit.FilterMode.Linear,
      canvasKit.MipmapMode?.None,
      paint,
    )
    return
  }
  canvas.drawImageRect(image, source, destination, paint, nearest)
}

export function drawCensorCanvasKit(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  canvas: CanvasKitCanvas,
  scene: RenderSceneSnapshot,
  node: RenderCensorNode,
  scale: number,
): void {
  const path = censorPath(canvasKit, node)
  const paint = new canvasKit.Paint()
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
  try {
    if (node.effect.mode === 'solid') {
      withTransform(canvas, node, center.x, center.y, () => {
        configurePaint(
          canvasKit,
          paint,
          node.effect.mode === 'solid'
            ? node.effect.color
            : { red: 0, green: 0, blue: 0, alpha: 0 },
          node.opacity,
          'fill',
        )
        paint.setBlendMode(blendMode(canvasKit, node.blendMode))
        canvas.drawPath(path, paint)
      })
      return
    }

    surface.flush()
    const below = surface.makeImageSnapshot()
    try {
      paint.setAntiAlias(false)
      paint.setColorComponents(1, 1, 1, node.opacity)
      paint.setBlendMode(blendMode(canvasKit, node.blendMode))
      if (node.effect.mode === 'blur') {
        const filter = canvasKit.ImageFilter?.MakeBlur(
          Math.max(0.5, (node.effect.strength * scale) / 2),
          Math.max(0.5, (node.effect.strength * scale) / 2),
          canvasKit.TileMode.Clamp,
          null,
        )
        try {
          paint.setImageFilter?.(filter ?? null)
          withTransform(canvas, node, center.x, center.y, () => {
            canvas.clipPath?.(path, canvasKit.ClipOp?.Intersect, true)
            cancelNodeTransform(canvas, node, center.x, center.y)
            drawSnapshotCanvasKit(
              canvasKit,
              canvas,
              below,
              canvasKit.XYWHRect(
                0,
                0,
                scene.width * scale,
                scene.height * scale,
              ),
              canvasKit.XYWHRect(0, 0, scene.width, scene.height),
              paint,
            )
          })
        } finally {
          paint.setImageFilter?.(null)
          filter?.delete()
        }
      } else {
        const effect = node.effect
        withTransform(canvas, node, center.x, center.y, () => {
          canvas.clipPath?.(path, canvasKit.ClipOp?.Intersect, false)
          cancelNodeTransform(canvas, node, center.x, center.y)
          for (let y = 0; y < scene.height; y += effect.blockSize) {
            for (let x = 0; x < scene.width; x += effect.blockSize) {
              const width = Math.min(effect.blockSize, scene.width - x)
              const height = Math.min(effect.blockSize, scene.height - y)
              const sampleX =
                Math.min(scene.width - 0.5, x + effect.blockSize / 2) * scale
              const sampleY =
                Math.min(scene.height - 0.5, y + effect.blockSize / 2) * scale
              drawSnapshotCanvasKit(
                canvasKit,
                canvas,
                below,
                canvasKit.XYWHRect(sampleX, sampleY, 1, 1),
                canvasKit.XYWHRect(x, y, width, height),
                paint,
                true,
              )
            }
          }
        })
      }
    } finally {
      below.delete()
    }
  } finally {
    paint.delete()
    path.delete()
  }
}

export function drawSpotlightCanvasKit(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  canvas: CanvasKitCanvas,
  scene: RenderSceneSnapshot,
  node: RenderSpotlightNode,
  scale: number,
): void {
  surface.flush()
  const below = surface.makeImageSnapshot()
  const path = spotlightPath(canvasKit, node)
  const paint = new canvasKit.Paint()
  const centerX = node.aperture.x + node.aperture.width / 2
  const centerY = node.aperture.y + node.aperture.height / 2
  let featherFilter: CanvasKitMaskFilter | undefined
  try {
    configurePaint(
      canvasKit,
      paint,
      node.dimColor,
      node.opacity * node.dimOpacity,
      'fill',
    )
    paint.setBlendMode(blendMode(canvasKit, node.blendMode))
    canvas.drawRect(canvasKit.XYWHRect(0, 0, scene.width, scene.height), paint)

    withTransform(canvas, node, centerX, centerY, () => {
      canvas.clipPath?.(path, canvasKit.ClipOp?.Intersect, true)
      cancelNodeTransform(canvas, node, centerX, centerY)
      paint.setColorComponents(1, 1, 1, 1)
      paint.setBlendMode(canvasKit.BlendMode.Src ?? canvasKit.BlendMode.SrcOver)
      drawSnapshotCanvasKit(
        canvasKit,
        canvas,
        below,
        canvasKit.XYWHRect(0, 0, scene.width * scale, scene.height * scale),
        canvasKit.XYWHRect(0, 0, scene.width, scene.height),
        paint,
      )
    })

    const feather = spotlightFeatherWidth(node.feather)
    if (feather > 0) {
      configurePaint(
        canvasKit,
        paint,
        node.dimColor,
        node.opacity * node.dimOpacity * 0.8,
        'stroke',
        feather * 0.9,
      )
      paint.setBlendMode(blendMode(canvasKit, node.blendMode))
      if (canvasKit.MaskFilter && canvasKit.BlurStyle && paint.setMaskFilter) {
        featherFilter = canvasKit.MaskFilter.MakeBlur(
          canvasKit.BlurStyle.Normal,
          Math.max(0.5, feather / 2),
          true,
        )
        paint.setMaskFilter(featherFilter)
      }
      withTransform(canvas, node, centerX, centerY, () => {
        canvas.drawPath(path, paint)
      })
    }
  } finally {
    paint.setMaskFilter?.(null)
    featherFilter?.delete()
    paint.delete()
    path.delete()
    below.delete()
  }
}

export function drawRulerCanvasKit(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: RenderRulerNode,
  typefaces?: CanvasKitTypefaceStore,
): void {
  const stroke = new canvasKit.Paint()
  const fill = new canvasKit.Paint()
  const centerX = (node.x1 + node.x2) / 2
  const centerY = (node.y1 + node.y2) / 2
  const label = formatRulerDisplayLabel(node)
  try {
    withTransform(canvas, node, centerX, centerY, () => {
      const dx = node.x2 - node.x1
      const dy = node.y2 - node.y1
      const length = Math.hypot(dx, dy)
      const perpendicular = { x: -dy / length, y: dx / length }
      const tickHalf = rulerEndpointTickHalfLength(node.thickness)
      configurePaint(
        canvasKit,
        stroke,
        node.color,
        node.opacity,
        'stroke',
        node.thickness,
      )
      stroke.setStrokeCap(canvasKit.StrokeCap.Butt)
      stroke.setBlendMode(blendMode(canvasKit, node.blendMode))
      canvas.drawLine(node.x1, node.y1, node.x2, node.y2, stroke)
      for (const endpoint of [
        { x: node.x1, y: node.y1 },
        { x: node.x2, y: node.y2 },
      ]) {
        canvas.drawLine(
          endpoint.x - perpendicular.x * tickHalf,
          endpoint.y - perpendicular.y * tickHalf,
          endpoint.x + perpendicular.x * tickHalf,
          endpoint.y + perpendicular.y * tickHalf,
          stroke,
        )
      }
    })
    if (!canvasKit.Font || !canvas.drawText) return
    const resolved = typefaces?.resolve('Roboto', label)
    const fallback = resolved
      ? undefined
      : (canvasKit.Typeface?.MakeDefault?.() ??
        canvasKit.Typeface?.GetDefault?.())
    const typeface = resolved?.typeface ?? fallback
    if (!typeface) return
    const font = new canvasKit.Font(typeface, node.fontSize)
    font.setEmbolden?.(true)
    try {
      const labelWidth = canvasKitTextWidth(font, label, node.fontSize)
      const badge = rulerBadgeBox(labelWidth, node.fontSize)
      const palette = rulerBadgePalette(node.color)
      const badgeRect = canvasKit.XYWHRect(
        -badge.width / 2,
        -badge.height / 2,
        badge.width,
        badge.height,
      )
      const rounded = canvasKit.RRectXY(badgeRect, badge.radius, badge.radius)
      const endpoints = rulerWorldEndpoints(node)
      const badgeCenterX = (endpoints.start.x + endpoints.end.x) / 2
      const badgeCenterY = (endpoints.start.y + endpoints.end.y) / 2
      canvas.save()
      try {
        canvas.translate(badgeCenterX, badgeCenterY)
        canvas.rotate(rulerBadgeRotationDegrees(node), 0, 0)
        configurePaint(
          canvasKit,
          fill,
          palette.background,
          node.opacity,
          'fill',
        )
        fill.setBlendMode(blendMode(canvasKit, node.blendMode))
        if (canvas.drawRRect) canvas.drawRRect(rounded, fill)
        else canvas.drawRect(badgeRect, fill)
        configurePaint(canvasKit, stroke, node.color, node.opacity, 'stroke', 1)
        stroke.setStrokeCap(canvasKit.StrokeCap.Butt)
        stroke.setBlendMode(blendMode(canvasKit, node.blendMode))
        if (canvas.drawRRect) canvas.drawRRect(rounded, stroke)
        else canvas.drawRect(badgeRect, stroke)
        configurePaint(canvasKit, fill, palette.text, node.opacity, 'fill')
        fill.setBlendMode(blendMode(canvasKit, node.blendMode))
        const baseline = resolveCanvasKitVisualCenterBaseline(
          font,
          label,
          -badge.height / 2,
          badge.height,
          node.fontSize,
          node.fontSize,
        )
        canvas.drawText(label, -labelWidth / 2, baseline, fill, font)
      } finally {
        canvas.restore()
      }
    } finally {
      font.delete()
      fallback?.delete()
    }
  } finally {
    fill.delete()
    stroke.delete()
  }
}
