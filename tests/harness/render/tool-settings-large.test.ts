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
  createEditorDocumentFromImage,
  createDrawingLayer,
  createSpotlightLayer,
  addSpotlightAperture,
  createDocumentRenderScene,
  DEFAULT_DRAWING_DEFAULTS,
} from '@cute-screen/editor-core'
import { Canvas2DRenderer } from '../../../packages/editor-renderer/src/backends/canvas2d/renderer'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'

describe('tool settings on production-shaped captures', () => {
  it.each([[3840, 2160, '4k'], [7680, 4320, '8k']] as const)('matches preview and decoded export at %i×%i', async (width, height, name) => {
    const bytes = await readFile(`tests/fixtures/generated/ui-${name}.png`)
    const blobHash = createHash('sha256').update(bytes).digest('hex')
    const document = createEditorDocumentFromImage({
      id: '019c1f62-058e-7000-8000-000000009001',
      baseLayerId: '019c1f62-058e-7000-8000-000000009002',
      source: {
        blobHash, format: 'png', mimeType: 'image/png', width, height,
        orientationApplied: true, provenance: 'capture',
        color: { colorSpace: 'srgb', hasIccProfile: false },
      },
      timestamp: '2026-10-16T00:00:00Z',
    })
    const points = Array.from({ length: 12000 },
      (_, index) => ({
        x: width * .1 + index * width * .6 / 12000,
        y: height * .4 + Math.sin(index / 90) * height * .05 + Math.sin(index * 1.4) * 3,
        pressure: .3 + .7 * (index % 100) / 100,
      }))
    const pencil = createDrawingLayer({
      id: '019c1f62-058e-7000-8000-000000009003',
      tool: 'pencil', start: points[0]!, end: points.at(-1)!, points,
      defaults: {
        ...DEFAULT_DRAWING_DEFAULTS,
        pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil, brush: 'brush', width: 12, smoothing: .75 },
      },
    })!
    let spotlight = createSpotlightLayer({
      id: '019c1f62-058e-7000-8000-000000009004',
      bounds: { x: width * .1, y: height * .15, width: width * .25, height: height * .4 },
      feather: 'soft',
    })
    for (let index = 0; index < 5; index++) {
      spotlight = addSpotlightAperture(spotlight, {
        id: `area-${index}`,
        shape: index % 2 ? 'ellipse' : 'rectangle',
        bounds: {
          x: index * width * .05, y: index * height * .02,
          width: width * .25, height: height * .4,
        },
      })
    }
    const scene = createDocumentRenderScene({ ...document, layers: [...document.layers, spotlight, pencil] })
    const preview = createCanvas(width, height)
    const renderer = new Canvas2DRenderer({
      exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike,
    })
    await renderer.initialize({
      scene: preview as unknown as HTMLCanvasElement,
      overlay: createCanvas(1, 1) as unknown as HTMLCanvasElement,
      dpr: 1, correlationId: `tools-${name}`,
    })
    try {
      await renderer.createImageResource({
        id: blobHash,
        width,
        height,
        source: await loadImage(bytes) as unknown as HTMLImageElement,
      })
      renderer.setScene(scene)
      const metric = renderer.render(['scene'])
      const checksum = createHash('sha256').update(preview.getContext('2d').getImageData(0, 0, width, height).data).digest('hex')
      const start = performance.now()
      const png = await renderer.exportPng()
      const exportMs = performance.now() - start
      const decoded = await loadImage(png)
      expect([decoded.width, decoded.height]).toEqual([width, height])
      const output = createCanvas(width, height)
      output.getContext('2d').drawImage(decoded, 0, 0)
      expect(createHash('sha256').update(output.getContext('2d').getImageData(0, 0, width, height).data).digest('hex')).toBe(checksum)
      await mkdir('artifacts/tool-settings', { recursive: true })
      await writeFile(`artifacts/tool-settings/${name}.json`, JSON.stringify({
        platform: `${process.platform}/${process.arch}`,
        fixtureSha256: blobHash, width, height,
        samples: points.length, apertures: spotlight.payload.apertures.length,
        renderMs: metric.duration, exportMs, decodedPixelSha256: checksum,
        note: 'Software correctness and timing evidence; not a GPU performance budget',
      }, null, 2))
    } finally {
      renderer.dispose()
    }
  }, 120000)
})
