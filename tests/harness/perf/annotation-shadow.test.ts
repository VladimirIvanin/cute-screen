import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  createDocumentRenderScene,
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from '@cute-screen/editor-core'
import { Canvas2DRenderer } from '@cute-screen/editor-renderer'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import { percentile } from './metrics'

// Shared CI software rendering reached 52.54 ms; keep headroom for host variance.
// This smoke ceiling is separate from the reference GPU/WebView frame budget.
const shadowP95SmokeBudgetMs = 100

describe('annotation shadow pointer frame cost', () => {
  it('avoids the CPU blur on a rotating tapered arrow over a 4K screenshot', async () => {
    const image = await loadImage(await readFile('tests/fixtures/generated/ui-4k.png'))
    const canvas = createCanvas(1, 1)
    const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
    await renderer.initialize({ scene: canvas as unknown as HTMLCanvasElement,
      overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement, dpr: 1, correlationId: 'annotation-shadow-perf' })
    await renderer.createImageResource({ id: 'background', width: image.width, height: image.height, source: image as unknown as HTMLImageElement })
    renderer.setPreviewScale(.5)
    const layer = { ...createDrawingLayer({ id: 'arrow', tool: 'arrow', start: { x: 600, y: 800 }, end: { x: 2400, y: 1600 },
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, arrow: { ...DEFAULT_DRAWING_DEFAULTS.arrow, appearance: 'tapered', path: 'elbow' } } })!, annotationShadow: 'strong' as const }
    const rows = []
    try {
      // Decode/render the production-like background once, as the live canvas
      // does while the edited layer moves on its independent overlay.
      renderer.setScene({ width: image.width, height: image.height,
        outputBounds: { x: 0, y: 0, width: image.width, height: image.height }, nodes: [
          { kind: 'image', id: 'background', resourceId: 'background', x: 0, y: 0, width: image.width, height: image.height,
            scaleX: 1, scaleY: 1, rotation: 0, opacity: 1, visible: true },
        ] })
      renderer.render(['scene'])
      for (const cpu of [true, false]) {
        const timings = []
        for (let i = 0; i < 34; i++) {
          const start = performance.now()
          const scene = createDocumentRenderScene({ ...documentFixture,
            canvas: { width: image.width, height: image.height },
            layers: [{ ...layer, transform: { ...layer.transform, rotation: i * 2 - 20 } }] })
          // The existing generic blur path is the CPU reference. Omitting its
          // tint only skips recolouring; the same alpha region is filtered.
          renderer.setScene({ ...scene, nodes: [
            ...scene.nodes.map((node) => {
              if (!cpu || node.kind !== 'group') return node
              const reference = { ...node }
              delete reference.tint
              return reference
            }),
          ] })
          renderer.render(['scene'])
          if (i >= 4) timings.push(performance.now() - start)
        }
        rows.push({ mode: cpu ? 'generic-cpu-blur-reference' : 'native-alpha-shadow', p50: percentile(timings, .5), p95: percentile(timings, .95), max: Math.max(...timings) })
        renderer.clearEffectCache()
      }
      await mkdir('artifacts/tapered-repair', { recursive: true })
      await writeFile('artifacts/tapered-repair/perf.json', JSON.stringify({ platform: `${process.platform}/${process.arch}`,
        width: image.width, height: image.height, previewScale: .5, samples: 30,
        p95SmokeBudgetMs: shadowP95SmokeBudgetMs, rows,
        note: 'Software Canvas2D transient frames on a 4K canvas. Background decoded/rendered once before gesture. Not a GPU or native WebView frame budget.' }, null, 2))
      expect(renderer.effectStats.groupFilteredPixels).toBeGreaterThan(0)
      expect(rows[1]!.p95).toBeLessThan(shadowP95SmokeBudgetMs)
    } finally {
      renderer.dispose()
    }
  }, 30000)
})
