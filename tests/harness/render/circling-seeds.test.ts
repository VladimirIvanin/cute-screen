import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import {
  createDrawingLayer,
  createDocumentRenderScene,
  DEFAULT_DRAWING_DEFAULTS,
  type LayerNode,
} from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import {
  assertGolden,
  rgba,
} from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)

function selectedCirclingScene() {
  const layers: LayerNode[] = []
  for (let row = 0; row < 4; row++) for (const [column, shape] of ['circling', 'rectangularCircling'].entries()) {
    if (row === 3 && column === 1) continue
    const x = 45 + column * 510, y = 28 + row * 170
    layers.push(createDrawingLayer({
      id: `019c1f62-058e-7000-8000-${String(layers.length).padStart(12, '0')}`,
      tool: 'shape', sketchSequence: row,
      start: { x, y }, end: { x: x + 420, y: y + 140 },
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, shape: { ...DEFAULT_DRAWING_DEFAULTS.shape, shape,
        stroke: { ...DEFAULT_DRAWING_DEFAULTS.shape.stroke as object, width: 5 },
      } },
    })!)
  }
  return createDocumentRenderScene({ ...documentFixture, canvas: { width: 1024, height: 720 }, layers })
}

async function composite(
  png: Uint8Array,
  scale: number,
): Promise<Uint8Array> {
  const surface = createCanvas(1024 * scale, 720 * scale)
  const context = surface.getContext('2d')
  const background = await loadImage(await readFile('tests/fixtures/generated/ui-4k.png'))
  context.drawImage(background, 0, 0, surface.width, surface.height)
  context.drawImage(await loadImage(png), 0, 0)
  return surface.encode('png')
}

describe('selected circling variants over a production-like screenshot', () => {
  it.each([1, 2])('decodes all seven variants with matching preview/export at scale %s', async (scale) => {
    const scene = selectedCirclingScene()
    const fallback = await canvas2dPngs(scene, 1, scale)
    const kit = renderHeadlessCanvasKitPng(canvasKit, scene, [], { scale })
    const decoded = await rgba(fallback.exported), decodedKit = await rgba(kit)
    expect(decoded.length).toBe(1024 * 720 * scale * scale * 4)
    expect(compareRgba(decoded, decodedKit, 32).changedChannels / decoded.length).toBeLessThan(0.02)
    if (scale === 1) {
      expect(compareRgba(decoded, await rgba(fallback.preview))).toEqual({ changedChannels: 0, maximumDelta: 0 })
    }
    for (const [backend, png] of [['canvas2d', fallback.exported], ['canvaskit', kit]] as const) {
      const screenshot = await composite(png, scale)
      await assertGolden(`circling-seeds-${scale}-${backend}`, screenshot)
      if (scale === 1) {
        await mkdir('artifacts/circling-seeds', { recursive: true })
        await writeFile(`artifacts/circling-seeds/${backend}.png`, screenshot)
        const plain = createCanvas(1024, 720)
        const context = plain.getContext('2d')
        context.fillStyle = '#ffffff'
        context.fillRect(0, 0, 1024, 720)
        context.drawImage(await loadImage(png), 0, 0)
        await writeFile(`artifacts/circling-seeds/${backend}-contours.png`, await plain.encode('png'))
      }
    }
  }, 30000)
})
