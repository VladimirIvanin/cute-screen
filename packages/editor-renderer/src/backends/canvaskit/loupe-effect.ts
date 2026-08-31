import type {
  RenderLoupeNode,
  RenderSceneSnapshot,
} from '@cute-screen/editor-core'
import {
  intersectPixelRects,
  loupeConnectorGeometry,
} from '../../precision-rendering'
import type {
  CanvasKitApi,
  CanvasKitCanvas,
  CanvasKitImage,
  CanvasKitPaint,
  CanvasKitPath,
  CanvasKitSurface,
} from './contracts'
import { drawSnapshotCanvasKit } from './effects'
import { withTransform } from './geometry'
import { blendMode, configurePaint } from './paint'
import { loupePath } from './paths'

function drawConnector(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  node: RenderLoupeNode,
  paint: CanvasKitPaint,
): void {
  const connector = loupeConnectorGeometry(node)
  if (!connector) return
  configurePaint(canvasKit, paint, node.border.color, node.opacity, 'stroke', 3)
  paint.setBlendMode(blendMode(canvasKit, node.blendMode))
  paint.setStrokeCap(canvasKit.StrokeCap.Round)
  paint.setStrokeJoin(canvasKit.StrokeJoin.Round)
  canvas.drawLine(
    connector.lensCenter.x,
    connector.lensCenter.y,
    connector.lineEnd.x,
    connector.lineEnd.y,
    paint,
  )
  const builder = new canvasKit.PathBuilder()
  builder.moveTo(connector.source.x, connector.source.y)
  builder.lineTo(connector.arrowLeft.x, connector.arrowLeft.y)
  builder.lineTo(connector.arrowRight.x, connector.arrowRight.y)
  builder.close()
  const arrow = builder.detach()
  builder.delete()
  try {
    configurePaint(canvasKit, paint, node.border.color, node.opacity, 'fill')
    paint.setBlendMode(blendMode(canvasKit, node.blendMode))
    canvas.drawPath(arrow, paint)
  } finally {
    arrow.delete()
  }
}

function drawShadow(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  path: CanvasKitPath,
  node: RenderLoupeNode,
  paint: CanvasKitPaint,
): void {
  if (!node.shadow) return
  configurePaint(
    canvasKit,
    paint,
    node.shadow.color,
    node.opacity,
    'stroke',
    Math.max(1, node.border.width),
  )
  const filter =
    canvasKit.MaskFilter && canvasKit.BlurStyle && paint.setMaskFilter
      ? canvasKit.MaskFilter.MakeBlur(
          canvasKit.BlurStyle.Normal,
          Math.max(0.5, node.shadow.blur / 2),
          true,
        )
      : undefined
  try {
    if (filter) paint.setMaskFilter?.(filter)
    canvas.save()
    canvas.translate(node.shadow.offsetX, node.shadow.offsetY)
    canvas.drawPath(path, paint)
    canvas.restore()
  } finally {
    paint.setMaskFilter?.(null)
    filter?.delete()
  }
}

function drawLensContents(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  below: CanvasKitImage,
  scene: RenderSceneSnapshot,
  node: RenderLoupeNode,
  scale: number,
  path: CanvasKitPath,
  paint: CanvasKitPaint,
): void {
  canvas.save()
  try {
    canvas.clipPath?.(path, canvasKit.ClipOp?.Intersect, true)
    paint.setAntiAlias(false)
    paint.setColorComponents(0, 0, 0, 0)
    paint.setBlendMode(canvasKit.BlendMode.Src)
    canvas.drawRect(
      canvasKit.XYWHRect(
        node.lens.x,
        node.lens.y,
        node.lens.size,
        node.lens.size,
      ),
      paint,
    )
    const source = intersectPixelRects(node.sourceRegion, {
      x: 0,
      y: 0,
      width: scene.width,
      height: scene.height,
    })
    if (!source) return
    paint.setColorComponents(1, 1, 1, node.opacity)
    paint.setBlendMode(blendMode(canvasKit, node.blendMode))
    const destinationX =
      node.lens.x + (source.x - node.sourceRegion.x) * node.zoom
    const destinationY =
      node.lens.y + (source.y - node.sourceRegion.y) * node.zoom
    drawSnapshotCanvasKit(
      canvasKit,
      canvas,
      below,
      canvasKit.XYWHRect(
        source.x * scale,
        source.y * scale,
        source.width * scale,
        source.height * scale,
      ),
      canvasKit.XYWHRect(
        destinationX,
        destinationY,
        source.width * node.zoom,
        source.height * node.zoom,
      ),
      paint,
      true,
    )
  } finally {
    canvas.restore()
  }
}

function drawBorder(
  canvasKit: CanvasKitApi,
  canvas: CanvasKitCanvas,
  path: CanvasKitPath,
  node: RenderLoupeNode,
  paint: CanvasKitPaint,
): void {
  if (node.border.width <= 0) return
  configurePaint(
    canvasKit,
    paint,
    node.border.color,
    node.opacity,
    'stroke',
    node.border.width,
  )
  paint.setBlendMode(blendMode(canvasKit, node.blendMode))
  canvas.drawPath(path, paint)
}

export function drawLoupeCanvasKit(
  canvasKit: CanvasKitApi,
  surface: CanvasKitSurface,
  canvas: CanvasKitCanvas,
  scene: RenderSceneSnapshot,
  node: RenderLoupeNode,
  scale: number,
): void {
  surface.flush()
  const below = surface.makeImageSnapshot()
  const path = loupePath(canvasKit, node)
  const paint = new canvasKit.Paint()
  const radius = node.lens.size / 2
  try {
    drawConnector(canvasKit, canvas, node, paint)
    withTransform(
      canvas,
      node,
      node.lens.x + radius,
      node.lens.y + radius,
      () => {
        drawShadow(canvasKit, canvas, path, node, paint)
        drawLensContents(
          canvasKit,
          canvas,
          below,
          scene,
          node,
          scale,
          path,
          paint,
        )
        drawBorder(canvasKit, canvas, path, node, paint)
      },
    )
  } finally {
    paint.setMaskFilter?.(null)
    paint.delete()
    path.delete()
    below.delete()
  }
}
