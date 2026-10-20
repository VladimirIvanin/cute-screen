import type { RenderGroupNode } from '@cute-screen/editor-core'
import type { Canvas2DLike } from '../backends/canvas2d/contracts'
import { cssColor } from '../backends/canvas2d/paint'
import {
  EffectFrame,
  effectKey,
  releaseCanvas,
} from '../effects/runtime'
import {
  groupBackdropGeometry,
  backdropEdgeCopies,
} from './group-backdrop'

export function compositeBackdrop2D(
  source: Canvas2DLike,
  sourceKey: string,
  node: RenderGroupNode,
  scale: number,
  newCanvas: (width: number, height: number) => Canvas2DLike,
  frame: EffectFrame,
) {
  const geometry = groupBackdropGeometry(node, scale)
  const key = `backdrop:${effectKey([sourceKey, node.backdrop, node.clip, node.destination, geometry.width, geometry.height])}`
  let canvas = frame.get(key)
  if (!canvas) {
    canvas = newCanvas(geometry.width, geometry.height)
    let complete = false
    try {
      const output = canvas.getContext('2d')!
      output.fillStyle = cssColor(node.backdrop!)
      output.fillRect(0, 0, canvas.width, canvas.height)
      const d = geometry.content
      output.drawImage(source as unknown as CanvasImageSource, d.x, d.y, d.width, d.height)
      for (const [from, to] of backdropEdgeCopies(canvas.width, canvas.height)) {
        output.clearRect(to.x, to.y, to.width, to.height)
        output.drawImage(canvas as unknown as CanvasImageSource,
          from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height)
      }
      frame.keep(key, canvas, true)
      complete = true
    } finally {
      if (!complete) releaseCanvas(canvas)
    }
  }
  return { canvas, destination: geometry.destination }
}
