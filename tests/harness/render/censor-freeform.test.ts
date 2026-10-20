import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  loadImage,
  createCanvas,
} from '@napi-rs/canvas'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import {
  canvasKit,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'

beforeAll(prepareGoldenRuntime)

async function pixel(
  bytes: Uint8Array,
  x: number,
  y: number,
) {
  const image = await loadImage(bytes)
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return Array.from(context.getImageData(x, y, 1, 1).data)
}

describe('nonzero freeform censor masks', () => {
  it.each([1, 2] as const)('preserves crossed lobes and double winding at export %ix', async (scale) => {
    const square = [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]
    const common = { opacity: 1, rotation: 0, visible: true }
    const scene = createRenderSceneSnapshot({ width: 200, height: 100, nodes: [
      { ...common, kind: 'rect', id: 'base', x: 0, y: 0, width: 200, height: 100,
        fill: { red: 0, green: 0, blue: 1, alpha: 1 } },
      { ...common, kind: 'censor', id: 'double', sampleSource: 'compositeBelow',
        region: { kind: 'freeform', points: [...square, ...square] },
        effect: { mode: 'solid', color: { red: 1, green: 0, blue: 0, alpha: 1 } } },
      { ...common, kind: 'censor', id: 'crossed', sampleSource: 'compositeBelow',
        region: { kind: 'freeform', points: [
          { x: 110, y: 10 }, { x: 190, y: 90 }, { x: 110, y: 90 }, { x: 190, y: 10 },
        ] }, effect: { mode: 'solid', color: { red: 1, green: 0, blue: 0, alpha: 1 } } },
    ] })
    const fallback = await canvas2dPngs(scene, 1, scale)
    const skia = renderHeadlessCanvasKitPng(canvasKit, scene, [], { scale })
    for (const bytes of [fallback.exported, skia]) {
      expect(await pixel(bytes, 40 * scale, 40 * scale)).toEqual([255, 0, 0, 255])
      expect(await pixel(bytes, 150 * scale, 20 * scale)).toEqual([255, 0, 0, 255])
      expect(await pixel(bytes, 115 * scale, 50 * scale)).toEqual([0, 0, 255, 255])
    }
  })
})
