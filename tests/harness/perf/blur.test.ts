import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createRenderSceneSnapshot,
  type RenderNode,
} from '@cute-screen/editor-core'
import { Canvas2DRenderer } from '@cute-screen/editor-renderer'
import { blurPixels } from '../../../packages/editor-renderer/src/effects/pixels'
import { legacyBlurImageData } from '../../../packages/editor-renderer/src/legacy-pixel-effects.test-kit'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'
import { measureScenario } from './metrics'

function compareBlurKernels(image: Awaited<ReturnType<typeof loadImage>>) {
  const source = createCanvas(image.width, image.height)
  try {
    const context = source.getContext('2d')
    context.drawImage(image, 0, 0)
    const oldPixels = context.getImageData(0, 0, image.width, image.height)
    const newPixels = context.getImageData(0, 0, image.width, image.height)
    let started = performance.now()
    legacyBlurImageData(oldPixels, 6)
    const legacyMs = performance.now() - started
    started = performance.now()
    blurPixels(newPixels, 6)
    const boundedKernelMs = performance.now() - started
    expect(Buffer.compare(
      Buffer.from(oldPixels.data.buffer, oldPixels.data.byteOffset, oldPixels.data.byteLength),
      Buffer.from(newPixels.data.buffer, newPixels.data.byteOffset, newPixels.data.byteLength),
    )).toBe(0)
    return { legacyMs, boundedKernelMs }
  } finally {
    source.width = 1
    source.height = 1
  }
}

describe('bounded blur performance', () => {
  it.each([[3840, 2160, 500, 'ui-4k.png'], [7680, 4320, 1000, 'ui-8k.png']] as const)(
    'records cold/warm %i×%i with %i layers', async (width, height, count, fixture) => {
      const bytes = await readFile(`tests/fixtures/generated/${fixture}`)
      const image = await loadImage(bytes)
      const { legacyMs, boundedKernelMs } = compareBlurKernels(image)
      const base = { rotation: 0, opacity: 1, visible: true }
      const nodes: RenderNode[] = [{ ...base, kind: 'image', id: 'image', resourceId: 'source', x: 0, y: 0,
        width, height, scaleX: 1, scaleY: 1 },
      ...Array.from({ length: count }, (_, i): RenderNode => ({ ...base, kind: 'rect', id: `r${i}`,
        x: i * 83 % (width - 100), y: i * 47 % (height - 70), width: 100, height: 70,
        fill: { red: .6, green: .3, blue: .8, alpha: .5 } })),
      { ...base, kind: 'censor', id: 'censor', sampleSource: 'compositeBelow', effect: { mode: 'blur', strength: 12 },
        region: { kind: 'rectangle', x: width * .35, y: height * .4, width: 640, height: 360 } }]
      const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
      const canvas = createCanvas(1, 1)
      const overlay = createCanvas(1, 1)
      try {
        await renderer.initialize({ scene: canvas as unknown as HTMLCanvasElement,
          overlay: overlay as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'blur-perf' })
        await renderer.createImageResource({ id: 'source', width, height, source: image as unknown as HTMLImageElement })
        const scene = createRenderSceneSnapshot({ width, height, nodes })
        renderer.setScene(scene)
        const started = performance.now()
        await renderer.prepareEffects()
        renderer.render(['scene'])
        const coldMs = performance.now() - started
        const initial = renderer.effectStats.filteredPixels
        const scenario = { name: `blur-${width}-${count}`, width, height, nodeCount: count,
          fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
          runner: `${process.platform}/${process.arch}; Canvas2D software; shared host; no GPU SLA` }
        const report = await measureScenario(scenario, () => {
          const start = performance.now()
          // Includes ordered scene replay and cache lookup, not just a prepared-frame blit.
          renderer.setScene({ ...scene })
          renderer.render(['scene'])
          return performance.now() - start
        }, 0)
        await renderer.prepareEffects()
        expect(renderer.effectStats.filteredPixels).toBe(initial)
        const warmStats = renderer.effectStats
        renderer.setPreviewScale(.25)
        renderer.setRenderMode('interactive')
        const censorBeforeMove = renderer.effectStats.censorFilteredPixels
        let i = 0
        const movement = await measureScenario({ ...scenario, name: `${scenario.name}-movement` }, async () => {
          const content = createRenderSceneSnapshot({ width, height, nodes: [...nodes,
            { ...base, kind: 'rect', id: 'moving', x: width * .2 + i * 3, y: height * .3,
              width: 160, height: 90, fill: { red: 1, green: 0, blue: 0, alpha: 1 } },
          ] })
          const group = { ...base, kind: 'group' as const, scene: content, cornerRadius: 0,
            clip: { x: 0, y: 0, width, height } }
          renderer.setScene(createRenderSceneSnapshot({ width, height, nodes: [
            { ...group, id: 'background', blur: 24, destination: { x: 0, y: 0, width, height } },
            { ...group, id: 'content', blur: 0,
              destination: { x: width * .08, y: height * .08, width: width * .84, height: height * .84 } },
          ] }))
          const start = performance.now()
          await renderer.prepareEffects()
          renderer.render(['scene'])
          const duration = performance.now() - start
          i++
          expect(renderer.effectStats.bytes).toBeLessThanOrEqual(128 * 1024 * 1024)
          expect(renderer.effectStats.temporaryGroupBytes).toBe(0)
          return duration
        }, 0)
        expect(renderer.effectStats.censorFilteredPixels).toBe(censorBeforeMove)
        expect(renderer.effectStats.bytes).toBeLessThanOrEqual(128 * 1024 * 1024)
        expect(renderer.effectStats.temporaryGroupBytes).toBe(0)
        const movingShapeWithBlurredBackground = { ...movement,
          stats: renderer.effectStats,
          unchangedCensorRecalculatedPixels: renderer.effectStats.censorFilteredPixels - censorBeforeMove }
        await mkdir('artifacts/blur-optimization', { recursive: true })
        await writeFile(`artifacts/blur-optimization/perf-${width}.json`, JSON.stringify({ report, coldMs,
          legacyMs, boundedKernelMs, warmStats, movingShapeWithBlurredBackground, nativeRadius: 6,
          oldScratchBytes: width * height * 36,
          newScratchBytes: (Math.min(height, 14) + 1) * width * 4 * 8,
          referenceBudgetMs: count === 500 ? 16.7 : 33.3,
          referenceBudgetStatus: 'Pending designated reference hardware; idle count is synthetic for this CPU-only harness' }, null, 2))
      } finally {
        renderer.dispose()
        canvas.width = 1
        canvas.height = 1
        overlay.width = 1
        overlay.height = 1
        expect(renderer.effectStats.bytes).toBe(0)
        expect(renderer.effectStats.temporaryGroupBytes).toBe(0)
        expect(renderer.effectStats.preparedBytes).toBe(0)
      }
    }, 180000,
  )
})
