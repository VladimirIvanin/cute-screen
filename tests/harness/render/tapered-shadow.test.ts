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
  createTextLayer,
  createDocumentRenderScene,
  DEFAULT_DRAWING_DEFAULTS,
  applyLayerStyle,
  type LayerNode,
} from '@cute-screen/editor-core'
import { renderHeadlessCanvasKitPng } from '@cute-screen/editor-renderer'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import {
  canvasKit,
  canvasKitFonts,
  canvas2dPngs,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'
import { rgba } from './golden-assertion-test-kit'
import { compareRgba } from './golden'

beforeAll(prepareGoldenRuntime)

function annotations(shadow: boolean) {
  const layers: LayerNode[] = []
  let index = 0
  const id = () => `019c1f62-058e-7000-8000-${String(++index).padStart(12, '0')}`
  for (let row = 0; row < 3; row++) for (let column = 0; column < 3; column++) {
    const tool = column === 2 ? 'shape' : 'arrow'
    const layer = createDrawingLayer({ id: id(), tool,
      start: { x: 70 + column * 330, y: 165 + row * 180 }, end: { x: 290 + column * 330, y: 65 + row * 180 },
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, arrow: { ...DEFAULT_DRAWING_DEFAULTS.arrow, appearance: column === 0 ? 'tapered' : 'clean', path: ['straight', 'quadratic', 'elbow'][row]!,
        stroke: { ...DEFAULT_DRAWING_DEFAULTS.arrow.stroke as object, width: 10 } }, shape: { ...DEFAULT_DRAWING_DEFAULTS.shape, shape: ['rectangle', 'oval', 'star'][row]!, stroke: { ...DEFAULT_DRAWING_DEFAULTS.shape.stroke as object, width: 10 } } } })!
    layers.push(shadow ? applyLayerStyle(layer, { annotationShadow: 'soft' }) : layer)
  }
  const text = createTextLayer({ id: id(), text: 'Стрелки и мягкая тень · Soft shadow', fontFamily: 'Roboto', fontSize: 28, origin: { x: 65, y: 600 }, color: { red: .9, green: .15, blue: .12, alpha: 1 } })!
  layers.push(shadow ? applyLayerStyle(text, { annotationShadow: 'strong' }) : text)
  return createDocumentRenderScene({ ...documentFixture, canvas: { width: 1080, height: 680 }, layers })
}

describe('tapered arrows and united silhouette shadows', () => {
  for (const scale of [1, 2]) it(`decodes both backends with visible shadows and preview parity at ${scale}×`, async () => {
    const scene = annotations(true)
    const fallback = await canvas2dPngs(scene, 1, scale)
    const kit = renderHeadlessCanvasKitPng(canvasKit, scene, canvasKitFonts, { scale })
    const noShadow = await canvas2dPngs(annotations(false), 1, scale)
    const a = await rgba(fallback.exported), b = await rgba(kit), plain = await rgba(noShadow.exported)
    expect(a.length).toBe(1080 * 680 * scale * scale * 4)
    expect(compareRgba(a, b, 32).changedChannels / a.length).toBeLessThan(.025)
    let shadowPixels = 0
    for (let i = 0; i < a.length; i += 4) if (plain[i + 3] === 0 && a[i + 3]! > 2) shadowPixels++
    expect(shadowPixels).toBeGreaterThan(8000 * scale * scale)
    if (scale === 1) expect(compareRgba(a, await rgba(fallback.preview))).toEqual({
      changedChannels: 0, maximumDelta: 0,
    })
    const background = await loadImage(await readFile('tests/fixtures/generated/ui-4k.png'))
    await mkdir('artifacts/tapered-shadow', { recursive: true })
    for (const [name, png] of [['canvas2d', fallback.exported], ['canvaskit', kit]] as const) {
      const image = await loadImage(png)
      expect([image.width, image.height]).toEqual([1080 * scale, 680 * scale])
      const canvas = createCanvas(image.width, image.height)
      const context = canvas.getContext('2d')
      context.fillStyle = '#faf9f5'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      await writeFile(`artifacts/tapered-shadow/${name}-${scale}.png`, await canvas.encode('png'))
      context.drawImage(background, 0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0)
      await writeFile(`artifacts/tapered-shadow/${name}-screenshot-${scale}.png`, await canvas.encode('png'))
    }
  })
})
