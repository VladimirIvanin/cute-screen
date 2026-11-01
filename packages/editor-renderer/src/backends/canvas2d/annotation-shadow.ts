import type { RenderGroupNode } from '@cute-screen/editor-core'
import type {
  Canvas2DLike,
  Context2D,
} from './contracts'
import { cssColor } from './paint'
import { roundedRectPath } from './paths'
import { releaseCanvas } from '../../effects/runtime'

/** Blur the union alpha with native Canvas2D, without a GPU readback/CPU pixel loop. */
export function drawAnnotationShadow2D(
  context: Context2D,
  node: RenderGroupNode,
  density: number,
  newCanvas: (width: number, height: number) => Canvas2DLike,
  render: (surface: Canvas2DLike, density: number) => void,
): void {
  if (!node.tint) throw new Error('Annotation shadow tint is required')
  const source = newCanvas(1, 1)
  let shadow: Canvas2DLike | undefined
  try {
    render(source, density)
    shadow = newCanvas(source.width, source.height)
    const target = shadow.getContext('2d')
    if (!target) throw new Error('Annotation shadow surface is unavailable')
    // Displace only the source. The native shadow lands on our bounded output,
    // so translucent ink never includes the original source a second time.
    const displacement = source.width + Math.ceil(node.blur * density * 3) + 2
    target.shadowColor = cssColor({ ...node.tint, alpha: 1 })
    target.shadowBlur = node.blur * density
    target.shadowOffsetX = displacement
    const pattern = target.createPattern(source as unknown as CanvasImageSource, 'no-repeat')
    if (!pattern) throw new Error('Annotation shadow alpha pattern is unavailable')
    target.fillStyle = pattern
    target.translate(-displacement, 0)
    target.fillRect(0, 0, source.width, source.height)
    context.save()
    try {
      roundedRectPath(context, node.clip.x, node.clip.y, node.clip.width, node.clip.height, node.cornerRadius)
      context.clip()
      context.globalAlpha = node.opacity * node.tint.alpha
      const d = node.destination
      context.drawImage(shadow as unknown as CanvasImageSource, d.x, d.y, d.width, d.height)
    } finally {
      context.restore()
    }
  } finally {
    releaseCanvas(source)
    if (shadow) releaseCanvas(shadow)
  }
}
