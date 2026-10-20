import type { RenderCensorNode } from '@cute-screen/editor-core'
import type {
  Canvas2DLike,
  Context2D,
} from '../backends/canvas2d/contracts'
import { withTransform } from '../backends/canvas2d/paint'
import { censorRegionPath } from '../backends/canvas2d/paths'
import {
  EffectCache,
  releaseCanvas,
  type PaintSteps,
  type PixelJob,
} from './runtime'
import type { PixelBuffer } from './pixels'

const TILE = 512

function populateTile(
  tile: Canvas2DLike,
  image: PixelBuffer,
  x: number,
  y: number,
): void {
  const output = tile.getContext('2d')!
  const pixels = output.getImageData(0, 0, tile.width, tile.height)
  for (let row = 0; row < tile.height; row++) {
    const start = ((y + row) * image.width + x) * 4
    pixels.data.set(image.data.subarray(start, start + tile.width * 4), row * tile.width * 4)
  }
  output.putImageData(pixels, 0, 0)
}

function* prepareTile(
  context: Context2D,
  canvas: Canvas2DLike,
  region: { x: number; y: number; width: number; height: number },
  mode: PixelJob['mode'],
  radius: number,
  factory: (width: number, height: number) => Canvas2DLike,
  cache: EffectCache,
): Generator<PixelJob, Canvas2DLike, void> {
  const { x, y, width, height } = region
  const sx = mode === 'blur' ? Math.max(0, x - radius) : Math.floor(x / radius) * radius
  // Preserve the legacy vertical recurrence from row zero; columns stay bounded.
  const sy = mode === 'blur' ? 0 : Math.floor(y / radius) * radius
  const ex = Math.min(canvas.width, mode === 'blur' ? x + width + radius : Math.ceil((x + width) / radius) * radius)
  const ey = Math.min(canvas.height, mode === 'blur' ? y + height + radius : Math.ceil((y + height) / radius) * radius)
  const input = context.getImageData(sx, sy, ex - sx, ey - sy)
  const image = { width: input.width, height: input.height, data: input.data }
  yield cache.filterJob('censor', image, mode, radius)
  const tile = factory(width, height)
  try {
    populateTile(tile, image, x - sx, y - sy)
    return tile
  } catch (error) {
    releaseCanvas(tile)
    throw error
  }
}

export function* drawCensorTiles(
  context: Context2D,
  canvas: Canvas2DLike,
  node: RenderCensorNode,
  scale: number,
  factory: (width: number, height: number) => Canvas2DLike,
  cache: EffectCache,
  prefix: string,
): PaintSteps {
  if (node.effect.mode === 'solid') return
  const points = node.region.kind === 'rectangle'
    ? [{ x: node.region.x, y: node.region.y },
        { x: node.region.x + node.region.width, y: node.region.y },
        { x: node.region.x + node.region.width, y: node.region.y + node.region.height },
        { x: node.region.x, y: node.region.y + node.region.height }]
    : node.region.points
  const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const centerY = points.reduce((sum, p) => sum + p.y, 0) / points.length
  let transformed = points
  withTransform(context, node, centerX, centerY, () => {
    const t = context.getTransform()
    transformed = points.map((p) => ({ x: t.a * p.x + t.c * p.y + t.e, y: t.b * p.x + t.d * p.y + t.f }))
  })
  const left = Math.max(0, Math.floor(Math.min(...transformed.map((p) => p.x)) - 1))
  const top = Math.max(0, Math.floor(Math.min(...transformed.map((p) => p.y)) - 1))
  const right = Math.min(canvas.width, Math.ceil(Math.max(...transformed.map((p) => p.x)) + 1))
  const bottom = Math.min(canvas.height, Math.ceil(Math.max(...transformed.map((p) => p.y)) + 1))
  if (right <= left || bottom <= top) return
  const effect = node.effect
  const radius = Math.max(1, Math.round(effect.mode === 'blur' ? effect.strength * scale / 2 : effect.blockSize * scale))
  // All tiles must sample the same compositeBelow, before any of them are painted.
  // A bounded region copy also avoids reading our own antialiased mask at tile seams.
  const tiles: { x: number; y: number; canvas: Canvas2DLike; retained: boolean }[] = []
  try {
    for (let y = Math.floor(top / TILE) * TILE; y < bottom; y += TILE) {
      for (let x = Math.floor(left / TILE) * TILE; x < right; x += TILE) {
        const width = Math.min(TILE, canvas.width - x)
        const height = Math.min(TILE, canvas.height - y)
        const key = `censor:${prefix}:${effect.mode}:${radius}:${x}:${y}`
        const cached = cache.get(key)
        const tile = cached ?? (yield* prepareTile(context, canvas, { x, y, width, height },
          effect.mode, radius, factory, cache))
        tiles.push({ x, y, canvas: tile, retained: Boolean(cached) })
      }
    }
    for (const tile of tiles) {
      withTransform(context, node, centerX, centerY, () => {
        censorRegionPath(context, node)
        context.clip()
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.drawImage(tile.canvas as unknown as CanvasImageSource, tile.x, tile.y)
      })
    }
    for (const tile of tiles) {
      if (tile.retained) continue
      const key = `censor:${prefix}:${effect.mode}:${radius}:${tile.x}:${tile.y}`
      tile.retained = cache.remember(key, tile.canvas)
    }
  } finally {
    for (const tile of tiles) if (!tile.retained) releaseCanvas(tile.canvas)
  }
}
