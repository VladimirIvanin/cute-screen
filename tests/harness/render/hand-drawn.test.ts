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
  readFile,
  mkdir,
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

function annotations() {
  const layers: LayerNode[] = []
  let identity = 0
  const id = () => `019c1f62-058e-7000-8000-${String(++identity).padStart(12, '0')}`
  for (let row = 0; row < 3; row++) {
    layers.push(createDrawingLayer({ id: id(), tool: 'shape', start: { x: 50, y: 55 + row * 170 }, end: { x: 340, y: 165 + row * 170 },
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, shape: { ...DEFAULT_DRAWING_DEFAULTS.shape, shape: row === 1 ? 'rectangularCircling' : 'circling',
        stroke: { ...DEFAULT_DRAWING_DEFAULTS.shape.stroke as object, width: 4, style: row === 2 ? 'dotted' : 'solid' },
      } },
    })!)
    for (let column = 0; column < 3; column++) {
      layers.push(createDrawingLayer({ id: id(), tool: 'arrow', start: { x: 410 + column * 195, y: 150 + row * 170 }, end: { x: 560 + column * 195, y: 75 + row * 170 },
        defaults: { ...DEFAULT_DRAWING_DEFAULTS, arrow: { ...DEFAULT_DRAWING_DEFAULTS.arrow, appearance: 'handDrawn',
          path: ['straight', 'quadratic', 'elbow'][column]!, endCap: ['lineArrow', 'solidArrow', 'diamond'][row]!,
          stroke: { ...DEFAULT_DRAWING_DEFAULTS.arrow.stroke as object, width: [3, 8, 12][row]!, style: row === 1 ? 'dashed' : 'solid' },
        } },
      })!)
    }
  }
  return createDocumentRenderScene({ ...documentFixture, canvas: { width: 1024, height: 640 }, layers })
}

async function screenshotComposite(
  png: Uint8Array,
  scale: number,
): Promise<Uint8Array> {
  const background = await loadImage(await readFile('tests/fixtures/generated/ui-4k.png'))
  const annotation = await loadImage(png)
  const surface = createCanvas(1024 * scale, 640 * scale)
  const context = surface.getContext('2d')
  context.drawImage(background, 0, 0, surface.width, surface.height)
  context.drawImage(annotation, 0, 0)
  return surface.encode('png')
}

describe('hand-drawn annotations on a production-like 4K screenshot', () => {
  for (const scale of [1, 2]) it(`decodes, compares backends and retains the exact preview at scale ${scale}`, async () => {
    const scene = annotations()
    const fallback = await canvas2dPngs(scene, 1, scale)
    const kit = renderHeadlessCanvasKitPng(canvasKit, scene, [], { scale })
    const a = await rgba(fallback.exported), b = await rgba(kit)
    expect(a.length).toBe(1024 * 640 * scale * scale * 4)
    expect(compareRgba(a, b, 32).changedChannels / a.length).toBeLessThan(0.02)
    if (scale === 1)
      expect(compareRgba(a, await rgba(fallback.preview))).toEqual({ changedChannels: 0, maximumDelta: 0 })
    for (const [backend, png] of [['canvas2d', fallback.exported], ['canvaskit', kit]] as const) {
      const composite = await screenshotComposite(png, scale)
      await assertGolden(`hand-drawn-${scale}-${backend}`, composite)
      if (scale === 1) {
        await mkdir('artifacts/hand-drawn', { recursive: true })
        await writeFile(`artifacts/hand-drawn/${backend}.png`, composite)
        if (backend === 'canvaskit') {
          const preview = createCanvas(1024, 640)
          const context = preview.getContext('2d')
          context.fillStyle = '#f6f8fa'
          context.fillRect(0, 0, 1024, 640)
          context.drawImage(await loadImage(png), 0, 0)
          await writeFile('artifacts/hand-drawn/annotations.png', await preview.encode('png'))
        }
      }
    }
  }, 30000)
})
