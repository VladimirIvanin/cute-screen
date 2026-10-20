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
import {
  measureScenario,
  percentile,
} from './metrics'

describe('bounded blur performance', () => {
  it.each([[3840, 2160, 500, 'ui-4k.png'], [7680, 4320, 1000, 'ui-8k.png']] as const)(
    'records cold/warm %i×%i with %i layers', async (width, height, count, fixture) => {
      const bytes = await readFile(`tests/fixtures/generated/${fixture}`)
      const image = await loadImage(bytes)
      const source = createCanvas(width, height)
      source.getContext('2d').drawImage(image, 0, 0)
      const oldPixels = source.getContext('2d').getImageData(0, 0, width, height)
      const newPixels = source.getContext('2d').getImageData(0, 0, width, height)
      let started = performance.now()
      legacyBlurImageData(oldPixels, 6)
      const legacyMs = performance.now() - started
      started = performance.now()
      blurPixels(newPixels, 6)
      const boundedKernelMs = performance.now() - started
      expect(Buffer.compare(Buffer.from(oldPixels.data), Buffer.from(newPixels.data))).toBe(0)
      const base = { rotation: 0, opacity: 1, visible: true }
      const nodes: RenderNode[] = [{ ...base, kind: 'image', id: 'image', resourceId: 'source', x: 0, y: 0,
        width, height, scaleX: 1, scaleY: 1 },
      ...Array.from({ length: count }, (_, i): RenderNode => ({ ...base, kind: 'rect', id: `r${i}`,
        x: i * 83 % (width - 100), y: i * 47 % (height - 70), width: 100, height: 70,
        fill: { red: .6, green: .3, blue: .8, alpha: .5 } })),
      { ...base, kind: 'censor', id: 'censor', sampleSource: 'compositeBelow', effect: { mode: 'blur', strength: 12 },
        region: { kind: 'rectangle', x: width * .35, y: height * .4, width: 640, height: 360 } }]
      const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
      await renderer.initialize({ scene: createCanvas(1, 1) as unknown as HTMLCanvasElement,
        overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'blur-perf' })
      await renderer.createImageResource({ id: 'source', width, height, source: image as unknown as HTMLImageElement })
      try {
        const scene = createRenderSceneSnapshot({ width, height, nodes })
        renderer.setScene(scene)
        started = performance.now()
        await renderer.prepareEffects()
        renderer.render(['scene'])
        const coldMs = performance.now() - started
        const initial = renderer.effectStats.filteredPixels
        const report = measureScenario({ name: `blur-${width}-${count}`, width, height, nodeCount: count,
          fixtureSha256: createHash('sha256').update(bytes).digest('hex'),
          runner: `${process.platform}/${process.arch}; Canvas2D software; shared host; trend only` }, () => {
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
        const movement: number[] = []
        const censorBeforeMove = renderer.effectStats.censorFilteredPixels
        for (let i = 0; i < 150; i++) {
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
          if (i >= 30) movement.push(performance.now() - start)
        }
        expect(renderer.effectStats.censorFilteredPixels).toBe(censorBeforeMove)
        expect(renderer.effectStats.bytes).toBeLessThanOrEqual(128 * 1024 * 1024)
        expect(renderer.effectStats.temporaryGroupBytes).toBe(0)
        const movingShapeWithBlurredBackground = { warmups: 30, measurements: 120,
          p50: percentile(movement, .5), p95: percentile(movement, .95), max: Math.max(...movement),
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
        source.width = 1
        source.height = 1
      }
    }, 180000,
  )
})
