import { groupRasterScale } from './group-scale'
import type { RenderNode } from '@cute-screen/editor-core'
import type {
  Canvas2DLike,
  Context2D,
} from '../backends/canvas2d/contracts'
import { roundedRectPath } from '../backends/canvas2d/paths'
import { blurImageData } from '../backends/canvas2d/effects'
import { freeformPixels } from './freeform'

type Group = Extract<RenderNode, { kind: 'group' }>
type NewCanvas = (width: number, height: number) => Canvas2DLike
export function drawGroup2D(
  context: Context2D,
  node: Group,
  scale: number,
  newCanvas: NewCanvas,
  render: (canvas: Canvas2DLike, scale: number) => void,
): void {
  const destination = node.destination
  // Censorship runs at native density before downsampling; offscreens stay bounded.
  const density = groupRasterScale(node.scene, node.destination.width, scale)
  const canvas = newCanvas(1, 1)
  render(canvas, density)
  if (node.blur > 0) {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height)
    blurImageData(
      pixels,
      Math.max(1, Math.round(node.blur * density * node.scene.outputBounds.width / destination.width)),
    )
    canvas.getContext('2d')!.putImageData(pixels, 0, 0)
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
    canvas.width = 1
    canvas.height = 1
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
