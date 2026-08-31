import type { RenderNode, RenderSceneSnapshot } from '@cute-screen/editor-core'
import { scaledOutputSize } from '../../precision-rendering'
import type { ImageResourceInput } from '../../types'
import type {
  Canvas2DImageResource,
  Canvas2DLike,
  Canvas2DRendererOptions,
  Context2D,
} from './contracts'
import {
  drawCensor2D,
  drawLoupe2D,
  drawRuler2D,
  drawSpotlight2D,
} from './effects'
import { drawNodes2D } from './nodes'
import { cssBlendMode, cssColor } from './paint'
import { roundedRectPath } from './paths'

type ImageNode = Extract<RenderNode, { kind: 'image' }>
type NewCanvas = (width: number, height: number) => Canvas2DLike
type FontResolver = NonNullable<Canvas2DRendererOptions['resolveFontFamily']>

interface SceneContext {
  readonly working: Canvas2DLike
  readonly context: Context2D
  readonly scene: RenderSceneSnapshot
  readonly scale: number
  readonly resources: ReadonlyMap<string, Canvas2DImageResource>
  readonly resourceSources: ReadonlyMap<string, ImageResourceInput['source']>
  readonly newCanvas: NewCanvas
  readonly resolveFontFamily: FontResolver
}

function imagePath(context: Context2D, node: ImageNode): void {
  roundedRectPath(
    context,
    0,
    0,
    node.width,
    node.height,
    node.cornerRadius ?? 0,
  )
}

function drawMissingImage(context: Context2D, node: ImageNode): void {
  context.fillStyle = 'rgba(184, 71, 71, 0.16)'
  context.strokeStyle = 'rgba(184, 71, 71, 0.9)'
  context.lineWidth = 1
  if ((node.cornerRadius ?? 0) > 0) {
    imagePath(context, node)
    context.fill()
    context.stroke()
    return
  }
  context.fillRect(0, 0, node.width, node.height)
  context.strokeRect(0, 0, node.width, node.height)
}

function drawImageStroke(context: Context2D, node: ImageNode): void {
  if (!node.stroke || (node.strokeWidth ?? 0) <= 0) return
  context.strokeStyle = cssColor(node.stroke)
  context.lineWidth = node.strokeWidth ?? 1
  context.lineJoin = node.lineJoin ?? 'miter'
  if ((node.cornerRadius ?? 0) > 0) {
    imagePath(context, node)
    context.stroke()
  } else {
    context.strokeRect(0, 0, node.width, node.height)
  }
}

function drawImageNode(context: SceneContext, node: ImageNode): void {
  const { context: canvas, resources } = context
  const resource = resources.get(node.resourceId)
  canvas.save()
  try {
    canvas.globalAlpha = node.opacity
    canvas.globalCompositeOperation = cssBlendMode(node.blendMode)
    canvas.translate(node.x, node.y)
    canvas.rotate((node.rotation * Math.PI) / 180)
    canvas.scale(node.scaleX, node.scaleY)
    if (resource) {
      if ((node.cornerRadius ?? 0) > 0) {
        imagePath(canvas, node)
        canvas.clip()
      }
      canvas.drawImage(resource.source, 0, 0, node.width, node.height)
    } else {
      drawMissingImage(canvas, node)
    }
    drawImageStroke(canvas, node)
  } finally {
    canvas.restore()
  }
}

function drawOrderedNode(context: SceneContext, node: RenderNode): void {
  switch (node.kind) {
    case 'censor':
      drawCensor2D(
        context.context,
        context.working,
        node,
        context.scale,
        context.newCanvas,
      )
      return
    case 'spotlight':
      drawSpotlight2D(
        context.context,
        context.working,
        context.scene,
        node,
        context.scale,
        context.newCanvas,
      )
      return
    case 'ruler':
      drawRuler2D(context.context, node, context.resolveFontFamily)
      return
    case 'loupe':
      drawLoupe2D(
        context.context,
        context.working,
        context.scene,
        node,
        context.scale,
        context.newCanvas,
      )
      return
    case 'image':
      drawImageNode(context, node)
      return
    default:
      drawNodes2D(
        context.context,
        [node],
        context.resourceSources,
        context.resolveFontFamily,
      )
  }
}

function copyOutput(
  canvas: Canvas2DLike,
  working: Canvas2DLike,
  scene: RenderSceneSnapshot,
  scale: number,
): void {
  if (working === canvas) return
  const size = scaledOutputSize(scene.outputBounds, scale)
  canvas.width = size.width
  canvas.height = size.height
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
    size.width,
    size.height,
  )
}

export function drawScene2D(
  canvas: Canvas2DLike,
  scene: RenderSceneSnapshot,
  scale: number,
  resources: ReadonlyMap<string, Canvas2DImageResource>,
  resourceSources: ReadonlyMap<string, ImageResourceInput['source']>,
  newCanvas: NewCanvas,
  resolveFontFamily: FontResolver,
): void {
  const fullWidth = Math.max(1, Math.round(scene.width * scale))
  const fullHeight = Math.max(1, Math.round(scene.height * scale))
  const usesFullCanvas =
    scale === 1 &&
    scene.outputBounds.x === 0 &&
    scene.outputBounds.y === 0 &&
    scene.outputBounds.width === scene.width &&
    scene.outputBounds.height === scene.height
  const working = usesFullCanvas ? canvas : newCanvas(fullWidth, fullHeight)
  working.width = fullWidth
  working.height = fullHeight
  const context = working.getContext('2d')!
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, working.width, working.height)
  context.setTransform(scale, 0, 0, scale, 0, 0)
  const sceneContext: SceneContext = {
    working,
    context,
    scene,
    scale,
    resources,
    resourceSources,
    newCanvas,
    resolveFontFamily,
  }
  for (const node of scene.nodes) {
    if (node.visible && node.opacity !== 0) drawOrderedNode(sceneContext, node)
  }
  copyOutput(canvas, working, scene, scale)
}
