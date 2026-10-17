import CanvasKitInit from 'canvaskit-wasm'
import {
  createRenderSceneSnapshot,
  type RenderLoupeNode,
} from '@cute-screen/editor-core'
import path from 'node:path'
import {
  mkdir,
  writeFile,
} from 'node:fs/promises'
import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import type { CanvasKitApi } from './backends/canvaskit/contracts'
import { renderHeadlessCanvasKitPng } from './backends/canvaskit/renderer'
import { loupeConnectorGeometry } from './precision-rendering'
import {
  canvas2dPng,
  decodedPixels,
  expectPixelClose,
  pixel,
  rect,
} from './precision-rendering.test-kit'

const proportions = [
  { size: 64, border: 0, thickness: 3, length: 16 },
  { size: 64, border: 3, thickness: 3, length: 16 },
  { size: 64, border: 8, thickness: 5.2, length: 20.8 },
  { size: 64, border: 64, thickness: 8, length: 32 },
  { size: 512, border: 0, thickness: 3, length: 25.6 },
  { size: 512, border: 3, thickness: 3, length: 25.6 },
  { size: 512, border: 8, thickness: 5.2, length: 25.6 },
  { size: 512, border: 64, thickness: 8, length: 32 },
] as const

function loupe(
  size: number,
  border: number,
  shape: 'circle' | 'rectangle' = 'circle',
): RenderLoupeNode {
  return {
    kind: 'loupe',
    id: 'loupe',
    sourceRegion: { x: 160 - size / 8, y: 500 - size / 8, width: size / 4, height: size / 4 },
    lens: { shape, x: 800, y: 500 - size / 2, size },
    zoom: 4,
    border: { color: { red: 1, green: 0.25, blue: 0.125, alpha: 1 }, width: border },
    shadow: null,
    sampleSource: 'compositeBelow',
    rotation: 0,
    opacity: 1,
    visible: true,
  }
}

describe('derived loupe pointer proportions (ADR-079)', () => {
  it.each([
    ...proportions,
    { size: 16, border: 0, thickness: 3, length: 8 },
    { size: 256, border: 3, thickness: 3, length: 16 },
    { size: 256, border: 8, thickness: 5.2, length: 20.8 },
    { size: 2048, border: 64, thickness: 8, length: 32 },
  ])('derives $size px lens / $border px border', ({ size, border, thickness, length }) => {
    const geometry = loupeConnectorGeometry(loupe(size, border))!
    expect(geometry.lineWidth).toBeCloseTo(thickness)
    expect(geometry.arrowLeft.x - geometry.source.x).toBeCloseTo(length)
    expect(geometry.source.y - geometry.arrowLeft.y).toBeCloseTo(length * 0.45)
    expect(geometry.arrowRight.y - geometry.source.y).toBeCloseTo(length * 0.45)
    expect(geometry.lineEnd.x - geometry.source.x).toBeCloseTo(length * 0.35)
  })

  it.each(['circle', 'rectangle'] as const)('omits the pointer inside a %s lens', (shape) => {
    const node = loupe(256, 8, shape)
    expect(loupeConnectorGeometry({ ...node, lens: { ...node.lens, x: 32 } })).toBeNull()
    expect(loupeConnectorGeometry({ ...node, lens: { ...node.lens, x: 0 } })).toBeNull()
  })

  it.each([
    [0, -1],
    [0, 1],
    [1, 0],
    [1, 1],
    [-1, -1],
  ])('points at the source along (%i, %i)', (dx, dy) => {
    const node = loupe(256, 8)
    const center = { x: node.lens.x + 128, y: node.lens.y + 128 }
    const source = { x: center.x + dx * 500, y: center.y + dy * 500 }
    const geometry = loupeConnectorGeometry({
      ...node,
      sourceRegion: { x: source.x - 32, y: source.y - 32, width: 64, height: 64 },
    })!
    const base = {
      x: (geometry.arrowLeft.x + geometry.arrowRight.x) / 2,
      y: (geometry.arrowLeft.y + geometry.arrowRight.y) / 2,
    }
    expect(geometry.source).toEqual(source)
    expect(Math.hypot(base.x - source.x, base.y - source.y)).toBeCloseTo(20.8)
    expect((source.x - base.x) * dy - (source.y - base.y) * dx).toBeCloseTo(0)
    expect((source.x - base.x) * dx + (source.y - base.y) * dy).toBeGreaterThan(0)
  })
})

describe('decoded loupe pointer pixels on a 1600×1000 document', () => {
  let canvasKit: CanvasKitApi
  beforeAll(async () => {
    canvasKit = await CanvasKitInit({
      locateFile: () => path.resolve('packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm'),
    }) as CanvasKitApi
  })

  for (const backend of ['canvas2d', 'canvaskit'] as const) {
    for (const size of [256, 512]) {
      for (const [background, value] of [['light', 0.94], ['dark', 0.08]] as const) {
        it(`${backend}: ${size} px pointer on ${background} at 50% / 100%`, async () => {
          const scene = createRenderSceneSnapshot({
            width: 1600,
            height: 1000,
            nodes: [rect('background', 0, 0, 1600, 1000, [value, value, value, 1]), loupe(size, 8)],
          })
          await mkdir('artifacts/loupe-pointer/visual', { recursive: true })
          for (const scale of [0.5, 1]) {
            const bytes = backend === 'canvas2d'
              ? await canvas2dPng(scene, { scale })
              : renderHeadlessCanvasKitPng(canvasKit, scene, [], { scale })
            const decoded = await decodedPixels(bytes)
            expect(decoded.width).toBe(1600 * scale)
            expect(decoded.height).toBe(1000 * scale)
            const length = size === 512 ? 25.6 : 20.8
            expectPixelClose(pixel(decoded, Math.round((160 + length * 0.8) * scale),
              Math.round((500 + length * 0.2) * scale)), [255, 64, 32, 255], 3)
            await writeFile(`artifacts/loupe-pointer/visual/${backend}-${background}-${size}-${scale}.png`, bytes)
          }
        })
      }
    }
    for (const shape of ['circle', 'rectangle'] as const) {
      for (const scale of [1, 2]) {
        it.each(proportions)(`${backend} ${shape} ${scale}×: $size px / $border px`, async ({
          size,
          border,
          thickness,
          length,
        }) => {
          const node = loupe(size, border, shape)
          const scene = createRenderSceneSnapshot({
            width: 1600,
            height: 1000,
            nodes: [rect('background', 0, 0, 1600, 1000, [0.08, 0.1, 0.12, 1]), node],
          })
          const bytes = backend === 'canvas2d'
            ? await canvas2dPng(scene, { scale })
            : renderHeadlessCanvasKitPng(canvasKit, scene, [], { scale })
          const decoded = await decodedPixels(bytes)
          expect(decoded.width).toBe(1600 * scale)
          expect(decoded.height).toBe(1000 * scale)
          // A point in the enlarged triangle, well outside the shaft and the old 12 px head.
          expectPixelClose(pixel(decoded, Math.round((160 + length * 0.8) * scale),
            Math.round((500 + length * 0.2) * scale)), [255, 64, 32, 255], 3)
          const shaftRows = Array.from({ length: 31 * scale }, (_, y) => y + 485 * scale)
            .filter((y) => {
              const sample = pixel(decoded, 600 * scale, y)
              return Math.abs(sample[0] - 255) <= 4 && Math.abs(sample[1] - 64) <= 4
            })
          expect(Math.abs(shaftRows.length - thickness * scale)).toBeLessThanOrEqual(2)
          // The connector must not be sampled into the magnified source contents.
          if (border < size / 2) {
            expectPixelClose(pixel(decoded, (800 + size / 2 + 24) * scale, 500 * scale), [20, 26, 31, 255], 2)
          }
          if (backend === 'canvas2d' && scale === 1) {
            const preview = await decodedPixels(await canvas2dPng(scene, { preview: true }))
            expect(Buffer.from(preview.data).equals(Buffer.from(decoded.data))).toBe(true)
          }
        }, 15000)
      }
    }
  }
})
