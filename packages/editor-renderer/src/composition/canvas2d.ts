import {
  groupRasterScale,
  groupNeedsFullSource,
} from './group-scale'
import type { RenderNode } from '@cute-screen/editor-core'
import type {
  Canvas2DLike,
  Context2D,
} from '../backends/canvas2d/contracts'
import { roundedRectPath } from '../backends/canvas2d/paths'
import { compositeBackdrop2D } from './canvas2d-backdrop'
import {
  EffectCache,
  EffectFrame,
  effectKey,
  releaseCanvas,
  type PaintSteps,
} from '../effects/runtime'
import { freeformPixels } from './freeform'

type Group = Extract<RenderNode, { kind: 'group' }>
type NewCanvas = (width: number, height: number) => Canvas2DLike
export function* drawGroup2D(
  context: Context2D,
  node: Group,
  scale: number,
  newCanvas: NewCanvas,
  render: (canvas: Canvas2DLike, scale: number) => PaintSteps,
  cache: EffectCache,
  frame: EffectFrame,
): PaintSteps {
  let destination = node.destination
  // Censorship runs at native density before downsampling; offscreens stay bounded.
  // Censorship retains native sampling even in an interactive background.
  const requested = cache.mode === 'interactive' && node.blur > 0
    ? Math.min(scale, 2048 / Math.max(destination.width, destination.height)) : scale
  const density = groupRasterScale(node.scene, node.destination.width, requested)
  const sourceBounds = groupNeedsFullSource(node.scene) ? node.scene : node.scene.outputBounds
  const alignSource = Boolean(node.backdrop && (
    sourceBounds.width * density !== Math.round(sourceBounds.width * density) ||
    sourceBounds.height * density !== Math.round(sourceBounds.height * density)
  ))
  const sourceKey = `group:${effectKey([node.scene, density, alignSource, cache.generation])}`
  const visibleSide = Math.max(1, Math.min(2048, Math.ceil(Math.max(destination.width, destination.height) * scale)))
  const sampleScale = cache.mode === 'interactive' && node.blur > 0
    ? Math.min(1, visibleSide / Math.max(Math.round(node.scene.outputBounds.width * density),
        Math.round(node.scene.outputBounds.height * density))) : 1
  const radius = node.blur > 0
    ? Math.max(1, Math.round(node.blur * density * sampleScale * node.scene.outputBounds.width / destination.width)) : 0
  const key = radius > 0 ? `${sourceKey}:blur:${radius}:${sampleScale}` : sourceKey
  let canvas = frame.get(key)
  if (!canvas) {
    let source = frame.get(sourceKey)
    if (!source) {
      source = newCanvas(1, 1)
      let complete = false
      try {
        yield* render(source, density)
        frame.keep(sourceKey, source, true)
        complete = true
      } finally {
        if (!complete) releaseCanvas(source)
      }
    }
    if (radius > 0) {
      // Reduce only the already censored image, never the raw source.
      const sample = sampleScale < 1
        ? newCanvas(
            Math.max(1, Math.round(source.width * sampleScale)),
            Math.max(1, Math.round(source.height * sampleScale)),
          ) : source
      let input: ImageData
      try {
        if (sample !== source) sample.getContext('2d')!.drawImage(
          source as unknown as CanvasImageSource,
          0,
          0,
          sample.width,
          sample.height,
        )
        input = sample.getContext('2d')!.getImageData(0, 0, sample.width, sample.height)
      } finally {
        if (sample !== source) releaseCanvas(sample)
      }
      const image = { width: input.width, height: input.height, data: input.data }
      yield cache.filterJob('group', image, 'blur', radius)
      canvas = newCanvas(image.width, image.height)
      const output = canvas.getContext('2d')!
      const pixels = output.getImageData(0, 0, canvas.width, canvas.height)
      pixels.data.set(image.data)
      output.putImageData(pixels, 0, 0)
      frame.keep(key, canvas)
    } else {
      canvas = source
    }
  }
  if (node.backdrop) {
    const composite = compositeBackdrop2D(canvas, key, node, scale, newCanvas, frame)
    canvas = composite.canvas
    destination = composite.destination
  }
  context.save()
  try {
    if (node.outerClip) {
      const b = node.outerClip.bounds
      roundedRectPath(context, b.x, b.y, b.width, b.height, node.outerClip.cornerRadius)
      context.clip()
    }
    roundedRectPath(context, node.clip.x, node.clip.y, node.clip.width, node.clip.height, node.cornerRadius)
    context.clip()
    context.globalAlpha = node.opacity
    context.drawImage(canvas as unknown as CanvasImageSource,
      destination.x,
      destination.y,
      destination.width,
      destination.height)
  } finally {
    context.restore()
  }
}
export function drawFreeform2D(
  context: Context2D,
  node: Extract<RenderNode, { kind: 'freeform' }>,
  scale: number,
  newCanvas: NewCanvas,
): void {
  const width = Math.max(1, Math.round(node.bounds.width * scale))
  const height = Math.max(1, Math.round(node.bounds.height * scale))
  const canvas = newCanvas(width, height)
  const ctx = canvas.getContext('2d')!
  const image = ctx.getImageData(0, 0, width, height)
  image.data.set(freeformPixels(node, width, height))
  ctx.putImageData(image, 0, 0)
  context.drawImage(canvas as unknown as CanvasImageSource,
    node.bounds.x,
    node.bounds.y,
    node.bounds.width,
    node.bounds.height)
  canvas.width = 1
  canvas.height = 1
}
