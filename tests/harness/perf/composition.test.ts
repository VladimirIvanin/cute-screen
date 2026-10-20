import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  readFile,
  mkdir,
  writeFile,
} from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  describe,
  it,
  expect,
} from 'vitest'
import {
  createEditorDocumentFromImage,
  createComposition,
  createRenderSceneSnapshot,
  rasterizeFreeform,
  type RenderNode,
} from '@cute-screen/editor-core'
import { composeDocumentScene } from '../../../packages/editor-core/src/composition/scene'
import { Canvas2DRenderer } from '@cute-screen/editor-renderer'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'
import { measureScenario } from './metrics'

describe('publication card performance evidence', () => {
  it.each([[3840, 2160, 500, 'ui-4k.png'], [7680, 4320, 1000, 'ui-8k.png']] as const)('records %i×%i with %i annotations', async (width, height, count, filename) => {
    const bytes = await readFile(`tests/fixtures/generated/${filename}`)
    const hash = createHash('sha256').update(bytes).digest('hex')
    const image = await loadImage(bytes)
    const doc = createEditorDocumentFromImage({ id: '019c1f62-058e-7000-8000-000000000000',
      baseLayerId: '019c1f62-058e-7000-8000-000000000001', timestamp: '2026-10-20T00:00:00Z',
      source: { blobHash: hash, format: 'png', mimeType: 'image/png', provenance: 'fileOpen', width, height,
        orientationApplied: true, color: { colorSpace: 'srgb', hasIccProfile: false } } })
    const base = { rotation: 0, opacity: 1, visible: true }
    const nodes: RenderNode[] = [{ ...base, kind: 'image', id: 'source', resourceId: hash, x: 0, y: 0, width, height, scaleX: 1, scaleY: 1 },
      ...Array.from({ length: count }, (_, n): RenderNode => ({ ...base, id: `annotation-${n}`, kind: 'rect',
        x: n * 83 % (width - 120), y: n * 47 % (height - 70), width: 120, height: 70,
        fill: { red: .6, green: .3, blue: .8, alpha: .5 } }))]
    const scene = composeDocumentScene({ ...doc, presentation: { ...doc.presentation, composition: createComposition('browser') } },
      createRenderSceneSnapshot({ width, height, nodes }), [])
    const runtime = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
    await runtime.initialize({ scene: createCanvas(1, 1) as unknown as HTMLCanvasElement,
      overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'composition-perf' })
    await runtime.createImageResource({ id: hash, width, height, source: image as unknown as HTMLImageElement })
    try {
      runtime.setScene(scene)
      const report = measureScenario({ name: `composition-${width}-${count}`, fixtureSha256: hash, width, height,
        nodeCount: count, runner: `${process.platform}/${process.arch} Canvas2D software; shared host; trend only` }, () => {
        const start = performance.now()
        runtime.render(['scene'])
        return performance.now() - start
      }, 0)
      const start = performance.now()
      const pixels = rasterizeFreeform(createComposition().background.freeform.points, 960, 540)
      const gradientMs = performance.now() - start
      expect(pixels.length).toBe(960 * 540 * 4)
      await mkdir('artifacts/composition', { recursive: true })
      await writeFile(`artifacts/composition/perf-${width}.json`, JSON.stringify({ report, gradientMs,
        referenceBudgetMs: count === 500 ? 16.7 : 33.3, referenceBudgetStatus: 'pending real reference GPU runner' }, null, 2))
    } finally {
      runtime.dispose()
    }
  }, 180000)
})
