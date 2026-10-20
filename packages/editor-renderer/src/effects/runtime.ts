import type { Canvas2DLike } from '../backends/canvas2d/contracts'
import type { RenderSceneSnapshot } from '@cute-screen/editor-core'
import {
  blurPixels,
  pixelatePixels,
  type PixelBuffer,
} from './pixels'

export type EffectMode = 'interactive' | 'settled'
export interface PixelJob {
  readonly image: PixelBuffer
  readonly mode: 'blur' | 'pixelate'
  readonly radius: number
}
export type PaintSteps = Generator<PixelJob, void, void>

export function hasPixelEffects(scene: RenderSceneSnapshot): boolean {
  return scene.nodes.some((node) => node.visible && node.opacity > 0 && (
    node.kind === 'censor' && node.effect.mode !== 'solid' ||
    node.kind === 'group' && (node.blur > 0 || hasPixelEffects(node.scene))
  ))
}

export function processPixels(job: PixelJob): void {
  if (job.mode === 'blur') blurPixels(job.image, job.radius)
  else pixelatePixels(job.image, job.radius)
}

export function finishSteps(steps: PaintSteps): void {
  for (const job of steps) processPixels(job)
}

/** Two independent 32-bit hashes; keys contain metadata only, never image bytes. */
export function effectKey(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  let a = 2166136261
  let b = 5381
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ text.charCodeAt(i)
  }
  return `${a >>> 0}:${b >>> 0}:${text.length}`
}

export function releaseCanvas(canvas: Canvas2DLike): void {
  canvas.width = 1
  canvas.height = 1
}

export class EffectCache {
  readonly limit = 128 * 1024 * 1024
  readonly entries = new Map<string, { canvas: Canvas2DLike; bytes: number; pins: number }>()
  bytes = 0
  hits = 0
  misses = 0
  filteredPixels = 0
  censorFilteredPixels = 0
  groupFilteredPixels = 0
  temporaryGroupBytes = 0
  peakTemporaryGroupBytes = 0
  peakFilterScratchBytes = 0
  generation = 0
  mode: EffectMode = 'settled'

  filterJob(
    kind: 'censor' | 'group',
    image: PixelBuffer,
    mode: PixelJob['mode'],
    radius: number,
  ): PixelJob {
    const pixels = image.width * image.height
    this.filteredPixels += pixels
    if (kind === 'censor') this.censorFilteredPixels += pixels
    else this.groupFilteredPixels += pixels
    const rows = Math.min(image.height, radius * 2 + 2)
    const scratch = image.data.byteLength + (mode === 'blur' ? (rows + 1) * image.width * 4 * 8 + rows * 4 : 0)
    this.peakFilterScratchBytes = Math.max(this.peakFilterScratchBytes, scratch)
    return { image, mode, radius }
  }

  get(key: string): Canvas2DLike | undefined {
    const entry = this.entries.get(key)
    if (!entry) {
      this.misses++
      return undefined
    }
    this.hits++
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.canvas
  }

  remember(
    key: string,
    canvas: Canvas2DLike,
  ): boolean {
    const bytes = canvas.width * canvas.height * 4
    if (bytes > this.limit) return false
    while (this.bytes + bytes > this.limit) {
      const oldest = [...this.entries].find(([, entry]) => entry.pins === 0)?.[0]
      if (oldest === undefined) return false
      const entry = this.entries.get(oldest)!
      this.entries.delete(oldest)
      this.bytes -= entry.bytes
      releaseCanvas(entry.canvas)
    }
    this.entries.set(key, { canvas, bytes, pins: 0 })
    this.bytes += bytes
    return true
  }

  clear(): void {
    for (const { canvas } of this.entries.values()) releaseCanvas(canvas)
    this.entries.clear()
    this.bytes = 0
    this.generation++
  }
}

/** A native 8K source must not evict the cached blur merely to draw it twice.
 * Large group inputs live for one paint, shared by background and foreground.
 * Pins prevent LRU admission from releasing a surface still used by this paint. */
export class EffectFrame {
  readonly #owned = new Map<string, Canvas2DLike>()
  readonly #pinned = new Set<{ pins: number }>()
  constructor(readonly cache: EffectCache) {}

  get(key: string): Canvas2DLike | undefined {
    const owned = this.#owned.get(key)
    if (owned) return owned
    const canvas = this.cache.get(key)
    const entry = this.cache.entries.get(key)
    if (entry && !this.#pinned.has(entry)) {
      entry.pins++
      this.#pinned.add(entry)
    }
    return canvas
  }

  keep(
    key: string,
    canvas: Canvas2DLike,
    source = false,
  ): void {
    if (
      (source &&
        canvas.width * canvas.height * 4 > this.cache.limit / 2) ||
        !this.cache.remember(key, canvas)
    ) {
      this.#owned.set(key, canvas)
      this.cache.temporaryGroupBytes += canvas.width * canvas.height * 4
      this.cache.peakTemporaryGroupBytes = Math.max(this.cache.peakTemporaryGroupBytes, this.cache.temporaryGroupBytes)
    } else this.get(key)
  }

  dispose(): void {
    for (const canvas of this.#owned.values()) {
      this.cache.temporaryGroupBytes -= canvas.width * canvas.height * 4
      releaseCanvas(canvas)
    }
    this.#owned.clear()
    for (const entry of this.#pinned) entry.pins--
    this.#pinned.clear()
  }
}
