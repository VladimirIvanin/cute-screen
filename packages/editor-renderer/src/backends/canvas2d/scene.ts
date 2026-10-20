import {
  EffectCache,
  EffectFrame,
  effectKey,
  finishSteps,
  type PaintSteps,
} from '../../effects/runtime'
import { drawCensorTiles } from '../../effects/censor'
import { groupNeedsFullSource } from '../../composition/group-scale'
import {
  drawGroup2D,
  drawFreeform2D,
} from '../../composition/canvas2d'
import type {
  RenderNode,
  RenderSceneSnapshot,
} from '@cute-screen/editor-core'
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
import {
  cssBlendMode,
  cssColor,
} from './paint'
import { roundedRectPath } from './paths'

type ImageNode = Extract<RenderNode, { kind: 'image' }>
type NewCanvas = (width: number, height: number) => Canvas2DLike
type FontResolver = NonNullable<Canvas2DRendererOptions['resolveFontFamily']>

interface SceneContext {
  readonly cache: EffectCache
  readonly frame: EffectFrame
  prefix: string
  readonly working: Canvas2DLike
  readonly context: Context2D
  readonly scene: RenderSceneSnapshot
  readonly scale: number
  readonly resources: ReadonlyMap<string, Canvas2DImageResource>
  readonly resourceSources: ReadonlyMap<string, ImageResourceInput['source']>
  readonly newCanvas: NewCanvas
  readonly resolveFontFamily: FontResolver
}

function imagePath(
  context: Context2D,
  node: ImageNode,
): void {
  roundedRectPath(context, 0, 0, node.width, node.height, node.cornerRadius ?? 0)
}

function drawMissingImage(
  context: Context2D,
  node: ImageNode,
): void {
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

function drawImageStroke(
  context: Context2D,
  node: ImageNode,
): void {
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

function drawImageNode(
  context: SceneContext,
  node: ImageNode,
): void {
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

function* drawOrderedNode(
  context: SceneContext,
  node: RenderNode,
): PaintSteps {
  switch (node.kind) {
    case 'group':
      yield* drawGroup2D(context.context, node, context.scale, context.newCanvas, (canvas, scale) =>
        drawScene2DSteps(canvas,
          node.scene,
          scale,
          context.resources,
          context.resourceSources,
          context.newCanvas,
          context.resolveFontFamily,
          !groupNeedsFullSource(node.scene), context.cache, context.frame, Boolean(node.backdrop)),
      context.cache, context.frame)
      return
    case 'freeform':
      drawFreeform2D(context.context, node, context.scale, context.newCanvas)
      return
    case 'censor':
      if (node.effect.mode === 'solid') drawCensor2D(context.context, context.working, node, context.scale, context.newCanvas)
      else yield* drawCensorTiles(
        context.context,
        context.working,
        node,
        context.scale,
        context.newCanvas,
        context.cache,
        context.prefix,
      )
      return
    case 'spotlight':
      drawSpotlight2D(context.context, context.working, context.scene, node, context.scale, context.newCanvas)
      return
    case 'ruler':
      drawRuler2D(context.context, node, context.resolveFontFamily)
      return
    case 'loupe':
      drawLoupe2D(context.context, context.working, context.scene, node, context.scale, context.newCanvas)
      return
    case 'image':
      drawImageNode(context, node)
      return
    default:
      drawNodes2D(context.context, [node], context.resourceSources, context.resolveFontFamily, context.newCanvas)
  }
}

function copyOutput(
  canvas: Canvas2DLike,
  working: Canvas2DLike,
  scene: RenderSceneSnapshot,
  scale: number,
  sourceScaleX = scale,
  sourceScaleY = scale,
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
    scene.outputBounds.x * sourceScaleX,
    scene.outputBounds.y * sourceScaleY,
    scene.outputBounds.width * sourceScaleX,
    scene.outputBounds.height * sourceScaleY,
    0,
    0,
    size.width,
    size.height,
  )
}

export function* drawScene2DSteps(
  canvas: Canvas2DLike,
  scene: RenderSceneSnapshot,
  scale: number,
  resources: ReadonlyMap<string, Canvas2DImageResource>,
  resourceSources: ReadonlyMap<string, ImageResourceInput['source']>,
  newCanvas: NewCanvas,
  resolveFontFamily: FontResolver,
  cropFirst = false,
  cache = new EffectCache(),
  frame?: EffectFrame,
  alignOutputEdges = false,
): PaintSteps {
  const paintFrame = frame ?? new EffectFrame(cache)
  const fullWidth = Math.max(1, Math.round((cropFirst ? scene.outputBounds.width : scene.width) * scale))
  const fullHeight = Math.max(1, Math.round((cropFirst ? scene.outputBounds.height : scene.height) * scale))
  const usesFullCanvas =
    scene.outputBounds.x === 0 &&
    scene.outputBounds.y === 0 &&
    scene.outputBounds.width === scene.width &&
    scene.outputBounds.height === scene.height
  const working = usesFullCanvas || cropFirst ? canvas : newCanvas(fullWidth, fullHeight)
  working.width = fullWidth
  working.height = fullHeight
  const context = working.getContext('2d')!
  // The destination mapping undoes this rounding, keeping content geometry intact.
  const scaleX = alignOutputEdges ? fullWidth / (cropFirst ? scene.outputBounds.width : scene.width) : scale
  const scaleY = alignOutputEdges ? fullHeight / (cropFirst ? scene.outputBounds.height : scene.height) : scale
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, working.width, working.height)
  context.setTransform(
    scaleX, 0, 0, scaleY,
    cropFirst ? -scene.outputBounds.x * scaleX : 0,
    cropFirst ? -scene.outputBounds.y * scaleY : 0,
  )
  const sceneContext: SceneContext = {
    frame: paintFrame,
    cache, prefix: effectKey([
      scene.width, scene.height, scene.outputBounds, scale, cropFirst, alignOutputEdges, cache.generation,
    ]),
    working,
    context,
    scene,
    scale,
    resources,
    resourceSources,
    newCanvas,
    resolveFontFamily,
  }
  try {
    for (const node of scene.nodes) {
      if (!node.visible || node.opacity === 0) continue
      yield* drawOrderedNode(sceneContext, node)
      sceneContext.prefix = effectKey([sceneContext.prefix, node])
    }
    copyOutput(canvas, working, scene, scale, scaleX, scaleY)
  } finally {
    if (!frame) paintFrame.dispose()
    if (working !== canvas) {
      working.width = 1
      working.height = 1
    }
  }
}

export function drawScene2D(...args: Parameters<typeof drawScene2DSteps>): void {
  finishSteps(drawScene2DSteps(...args))
}
