import {
  createCanvas,
  type Canvas,
} from '@napi-rs/canvas'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createRenderSceneSnapshot,
  type RenderCensorNode,
  type RenderNode,
} from '@cute-screen/editor-core'
import { Canvas2DRenderer } from './backends/canvas2d/renderer'
import type {
  Canvas2DLike,
  Context2D,
} from './backends/canvas2d/contracts'
import { censorRegionPath } from './backends/canvas2d/paths'
import { withTransform } from './backends/canvas2d/paint'
import {
  legacyBlurImageData,
  legacyPixelateImageData,
} from './legacy-pixel-effects.test-kit'
import {
  EffectCache,
  EffectFrame,
} from './effects/runtime'

const base = { opacity: 1, rotation: 0, visible: true }
const factory = (w: number, h: number) => createCanvas(w, h) as unknown as Canvas2DLike

function source(
  width: number,
  height: number,
) {
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  const image = context.getImageData(0, 0, width, height)
  let seed = 314159
  for (let i = 0; i < image.data.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    image.data[i] = seed >>> 24
  }
  context.putImageData(image, 0, 0)
  return canvas
}

function legacy(
  canvas: Canvas,
  node: RenderCensorNode,
  scale: number,
) {
  const copy = createCanvas(canvas.width, canvas.height)
  const context = canvas.getContext('2d') as unknown as Context2D
  copy.getContext('2d').drawImage(canvas, 0, 0)
  const pixels = copy.getContext('2d').getImageData(0, 0, copy.width, copy.height)
  if (node.effect.mode === 'blur') legacyBlurImageData(pixels, Math.max(1, Math.round(node.effect.strength * scale / 2)))
  else if (node.effect.mode === 'pixelate') legacyPixelateImageData(pixels, Math.max(1, Math.round(node.effect.blockSize * scale)))
  copy.getContext('2d').putImageData(pixels, 0, 0)
  const r = node.region
  const cx = r.kind === 'rectangle' ? r.x + r.width / 2 : r.points.reduce((s, p) => s + p.x, 0) / r.points.length
  const cy = r.kind === 'rectangle' ? r.y + r.height / 2 : r.points.reduce((s, p) => s + p.y, 0) / r.points.length
  withTransform(context, node, cx, cy, () => {
    censorRegionPath(context, node)
    context.clip()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(copy as unknown as CanvasImageSource, 0, 0)
  })
}

async function runtime(
  width = 1100,
  height = 790,
) {
  const image = source(width, height)
  const scene = createCanvas(1, 1)
  const renderer = new Canvas2DRenderer({ exportCanvas: factory })
  await renderer.initialize({ scene: scene as unknown as HTMLCanvasElement,
    overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'effect-cache' })
  await renderer.createImageResource({ id: 'image', width, height, source: image as unknown as HTMLImageElement })
  const background: RenderNode = { ...base, id: 'image', kind: 'image', resourceId: 'image', x: 0, y: 0,
    width, height, scaleX: 1, scaleY: 1 }
  return { renderer, image, scene, background, width, height }
}

describe('Canvas2D ordered effect cache', () => {
  it('shares a large source within one frame without evicting a pinned blur', () => {
    const cache = new EffectCache()
    const blur = { width: 4096, height: 4096 } as Canvas2DLike
    const source = { width: 5000, height: 5000 } as Canvas2DLike
    cache.remember('blur', blur)
    const frame = new EffectFrame(cache)
    expect(frame.get('blur')).toBe(blur)
    frame.keep('source', source, true)
    expect(frame.get('source')).toBe(source)
    expect(cache.bytes).toBe(64 * 1024 * 1024)
    expect(cache.temporaryGroupBytes).toBe(100000000)
    const other = { width: 5000, height: 5000 } as Canvas2DLike
    expect(cache.remember('other', other)).toBe(false)
    expect(blur.width).toBe(4096)
    frame.dispose()
    expect(source.width).toBe(1)
    expect(cache.temporaryGroupBytes).toBe(0)
    expect(cache.remember('other', other)).toBe(true)
    expect(blur.width).toBe(1)
    cache.clear()
  })
  it('discards an unfinished old scene after a document switch', async () => {
    const r = await runtime(32, 32)
    const workers: {
      onmessage: ((event: MessageEvent<Uint8ClampedArray>) => void) | null
      onerror: ((event: ErrorEvent) => void) | null
      terminate(): void
    }[] = []
    vi.stubGlobal('Worker', class {
      onmessage = null
      onerror = null
      constructor() {
        workers.push(this)
      }
      postMessage() { /* The old frame remains pending until explicitly cancelled. */ }
      terminate() { /* No native process exists in this worker test double. */ }
    })
    try {
      r.renderer.setScene(createRenderSceneSnapshot({ width: 32, height: 32, nodes: [r.background,
        { ...base, kind: 'censor', id: 'old', sampleSource: 'compositeBelow', effect: { mode: 'blur', strength: 12 },
          region: { kind: 'rectangle', x: 0, y: 0, width: 20, height: 20 } }] }))
      const pending = r.renderer.prepareEffects()
      const cancelled = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
      await vi.waitFor(() => expect(workers).toHaveLength(1))
      const oldReply = workers[0]!.onmessage
      r.renderer.clearEffectCache()
      r.renderer.setScene(createRenderSceneSnapshot({ width: 32, height: 32, nodes: [
        { ...base, kind: 'rect', id: 'new', x: 0, y: 0, width: 32, height: 32,
          fill: { red: 1, green: 0, blue: 0, alpha: 1 } },
      ] }))
      await cancelled
      await r.renderer.prepareEffects()
      oldReply?.({ data: new Uint8ClampedArray(32 * 32 * 4) } as MessageEvent<Uint8ClampedArray>)
      r.renderer.render(['scene'])
      expect([...r.scene.getContext('2d').getImageData(15, 15, 1, 1).data]).toEqual([255, 0, 0, 255])
    } finally {
      r.renderer.dispose()
      vi.unstubAllGlobals()
    }
  })

  it('reuses group pixels across placement, clip and opacity changes', async () => {
    const r = await runtime(180, 130)
    const scene = createRenderSceneSnapshot({ width: r.width, height: r.height, nodes: [r.background] })
    const group: Extract<RenderNode, { kind: 'group' }> = { ...base, kind: 'group', id: 'bg', scene,
      destination: { x: 0, y: 0, width: 180, height: 130 }, clip: { x: 0, y: 0, width: 180, height: 130 },
      cornerRadius: 0, blur: 12 }
    try {
      r.renderer.setScene(createRenderSceneSnapshot({ width: 200, height: 150, nodes: [group] }))
      await r.renderer.prepareEffects()
      const filtered = r.renderer.effectStats.filteredPixels
      r.renderer.setScene(createRenderSceneSnapshot({ width: 200, height: 150, nodes: [{ ...group,
        opacity: .7, cornerRadius: 20, destination: { ...group.destination, x: 10, y: 10 },
      }] }))
      await r.renderer.prepareEffects()
      expect(r.renderer.effectStats.filteredPixels).toBe(filtered)
      expect(r.renderer.effectStats.hits).toBeGreaterThan(0)
    } finally {
      r.renderer.dispose()
    }
  })

  it.each(['blur', 'pixelate'] as const)('matches the old whole-surface %s through transforms, seams and overlapping masks', async (mode) => {
    const r = await runtime()
    try {
      for (const scale of [1, 2]) {
        const nodes: RenderCensorNode[] = [{ ...base, kind: 'censor', id: 'a', sampleSource: 'compositeBelow',
          effect: mode === 'blur' ? { mode, strength: 12 } : { mode, blockSize: 17 },
          region: { kind: 'rectangle', x: 420, y: 310, width: 510, height: 410 }, rotation: 11, scaleX: -1 },
        { ...base, kind: 'censor', id: 'b', opacity: .6, sampleSource: 'compositeBelow',
          effect: { mode: 'blur', strength: 24 }, region: { kind: 'freeform', points: [
            { x: 480, y: 290 }, { x: 1090, y: 400 }, { x: 800, y: 810 }, { x: 400, y: 650 },
          ] } }]
        const expected = createCanvas(r.width * scale, r.height * scale)
        expected.getContext('2d').scale(scale, scale)
        expected.getContext('2d').drawImage(r.image, 0, 0)
        for (const node of nodes) legacy(expected, node, scale)
        r.renderer.setScene(createRenderSceneSnapshot({
          width: r.width, height: r.height, nodes: [r.background, ...nodes],
        }))
        r.renderer.setPreviewScale(scale)
        await r.renderer.prepareEffects()
        r.renderer.render(['scene'])
        expect(Buffer.compare(Buffer.from(r.scene.getContext('2d').getImageData(0, 0, expected.width, expected.height).data),
          Buffer.from(expected.getContext('2d').getImageData(0, 0, expected.width, expected.height).data))).toBe(0)
      }
    } finally {
      r.renderer.dispose()
    }
  })

  it('reuses a stationary underlay on move/style-above and invalidates changed content below', async () => {
    const r = await runtime()
    const censor: RenderCensorNode = { ...base, kind: 'censor', id: 'censor', sampleSource: 'compositeBelow',
      effect: { mode: 'blur', strength: 12 }, region: { kind: 'rectangle', x: 100, y: 100, width: 180, height: 180 } }
    const set = (nodes: RenderNode[]) => r.renderer.setScene(createRenderSceneSnapshot({
      width: r.width, height: r.height, nodes,
    }))
    try {
      set([r.background, censor])
      await r.renderer.prepareEffects()
      const initial = r.renderer.effectStats.filteredPixels
      set([r.background, { ...censor, region: { kind: 'rectangle', x: 170, y: 130, width: 200, height: 200 } },
        { ...base, id: 'above', kind: 'rect', x: 0, y: 0, width: 50, height: 50, fill: { red: 1, green: 0, blue: 0, alpha: 1 } }])
      await r.renderer.prepareEffects()
      expect(r.renderer.effectStats.filteredPixels).toBe(initial)
      set([{ ...base, id: 'below', kind: 'rect', x: 0, y: 0, width: 600, height: 600, fill: { red: 1, green: 0, blue: 0, alpha: 1 } }, censor])
      await r.renderer.prepareEffects()
      expect(r.renderer.effectStats.filteredPixels).toBeGreaterThan(initial)
      const replacement = await r.renderer.createImageResource({ id: 'image', width: r.width, height: r.height,
        source: r.image as unknown as HTMLImageElement })
      expect(r.renderer.effectStats.bytes).toBe(0)
      replacement.dispose()
    } finally {
      r.renderer.dispose()
    }
    expect(r.renderer.effectStats.bytes).toBe(0)
  })

  it('rejects cancelled preparation and can render again', async () => {
    const r = await runtime(32, 32)
    try {
      r.renderer.setScene(createRenderSceneSnapshot({ width: 32, height: 32, nodes: [r.background] }))
      const signal = AbortSignal.abort()
      await expect(r.renderer.prepareEffects({ signal })).rejects.toMatchObject({ name: 'AbortError' })
      await r.renderer.prepareEffects()
      r.renderer.render(['scene'])
      expect(r.scene.width).toBe(32)
    } finally {
      r.renderer.dispose()
    }
  })

  it('evicts least recently used surfaces within 128 MiB and releases on clear', () => {
    const cache = new EffectCache()
    const a = { width: 4096, height: 4096 } as Canvas2DLike
    const b = { width: 4096, height: 4096 } as Canvas2DLike
    const c = { width: 4096, height: 4096 } as Canvas2DLike
    cache.remember('a', a)
    cache.remember('b', b)
    cache.get('a')
    cache.remember('c', c)
    expect(b.width).toBe(1)
    expect(cache.get('a')).toBe(a)
    expect(cache.bytes).toBe(cache.limit)
    cache.clear()
    expect(a.width).toBe(1)
    expect(c.width).toBe(1)
    expect(cache.bytes).toBe(0)
  })
})
