import {
  beforeAll,
  expect,
  it,
} from 'vitest'
import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  createComposition,
  createRenderSceneSnapshot,
  type RenderGroupNode,
  type RenderSceneSnapshot,
} from '@cute-screen/editor-core'
import { composeDocumentScene } from '../../../packages/editor-core/src/composition/scene'
import { documentFixture } from '../../../packages/editor-core/src/document/scene/test-kit'
import { drawScene2D } from '../../../packages/editor-renderer/src/backends/canvas2d/scene'
import type { Canvas2DLike } from '../../../packages/editor-renderer/src/backends/canvas2d/contracts'
import { renderCanvasKitPng } from '../../../packages/editor-renderer/src/backends/canvaskit/scene'
import { CanvasKitTypefaceStore } from '../../../packages/editor-renderer/src/backends/canvaskit/geometry'
import {
  canvasKit,
  prepareGoldenRuntime,
} from './golden-runtime-test-kit'

beforeAll(prepareGoldenRuntime)
const base = { visible: true, opacity: 1, rotation: 0 } as const
const dark = { red: 20 / 255, green: 20 / 255, blue: 20 / 255, alpha: 1 }
const newCanvas = (width: number, height: number) => createCanvas(width, height) as unknown as Canvas2DLike

async function outputs(
  scene: RenderSceneSnapshot,
  scale: number,
) {
  const canvas = createCanvas(1, 1)
  drawScene2D(canvas as unknown as Canvas2DLike, scene, scale, new Map(), new Map(), newCanvas, () => 'Roboto')
  const fonts = new CanvasKitTypefaceStore(canvasKit, [])
  try {
    const bytes = [await canvas.encode('png'), renderCanvasKitPng(canvasKit, scene, new Map(), fonts, { scale })]
    return await Promise.all(bytes.map(async (png) => {
      const decoded = await loadImage(png)
      const target = createCanvas(decoded.width, decoded.height)
      target.getContext('2d').drawImage(decoded, 0, 0)
      return target.getContext('2d').getImageData(0, 0, target.width, target.height)
    }))
  } finally {
    fonts.dispose()
  }
}

it.each(['portrait', 'landscape', 'window', 'browser'] as const)('has no bright screen fringe for %s at fractional densities', async (kind) => {
  const content = createRenderSceneSnapshot({ width: 3840, height: 2160, nodes: [
    { ...base, id: 'opaque-dark', kind: 'rect', x: 0, y: 0, width: 3840, height: 2160, fill: dark },
  ] })
  for (const theme of ['dark', 'light'] as const) {
    const start = createComposition('phone')
    const composition = { ...start, shadow: 0, radius: 38,
      layout: { ...start.layout, mode: 'fixed' as const, width: 389, height: 277, scale: 0.99,
        insets: { top: 18.3, right: 18.3, bottom: 18.3, left: 18.3, unit: 'px' as const, linked: true } },
      frame: { ...start.frame, kind: kind === 'window' || kind === 'browser' ? kind : 'phone' as const,
        orientation: kind === 'portrait' ? 'portrait' as const : 'landscape' as const, fit: 'cover' as const, theme } }
    const document = { ...documentFixture, canvas: { width: 3840, height: 2160 }, crop: null,
      presentation: { ...documentFixture.presentation, composition } }
    const scene = composeDocumentScene(document, content, [])
    // An opaque screen must render like the same scene with no screen background.
    const reference = { ...scene, nodes: scene.nodes.filter((node) => node.id !== 'card:screen').map((node) => {
      if (node.kind !== 'group' || node.id !== 'card:content') return node
      const { backdrop, ...plain } = node
      void backdrop
      return plain
    }) }
    for (const scale of [0.63, 1, 1.25, 2]) {
      const actual = await outputs(scene, scale)
      const expected = await outputs(reference, scale)
      for (let backend = 0; backend < actual.length; backend++) {
        let brightFringe = 0
        let worst = 0
        for (let i = 0; i < actual[backend]!.data.length; i += 4) {
          const difference = actual[backend]!.data[i]! - expected[backend]!.data[i]!
          if (difference > brightFringe) {
            brightFringe = difference
            worst = i
          }
        }
        const point = `${worst / 4 % actual[backend]!.width},${Math.floor(worst / 4 / actual[backend]!.width)}`
        expect(brightFringe, `${kind}/${theme}/${scale}/${backend} at ${point}`).toBeLessThanOrEqual(3)
      }
    }
  }
})

it('composites transparent content and empty fields before applying group opacity and outer clip', async () => {
  const content = createRenderSceneSnapshot({ width: 20, height: 20, nodes: [
    { ...base, id: 'red', kind: 'rect', x: 0, y: 0, width: 20, height: 20,
      fill: { red: 1, green: 0, blue: 0, alpha: 0.5 } },
  ] })
  const group: RenderGroupNode = { ...base, id: 'screen', kind: 'group', scene: content,
    destination: { x: 30, y: 30, width: 20, height: 20 }, clip: { x: 10, y: 10, width: 60, height: 60 },
    cornerRadius: 0, blur: 0, opacity: 0.5, backdrop: { red: 0, green: 0, blue: 1, alpha: 1 },
    outerClip: { bounds: { x: 20, y: 20, width: 40, height: 40 }, cornerRadius: 8 } }
  const scene = createRenderSceneSnapshot({ width: 80, height: 80, nodes: [group] })
  for (const pixels of await outputs(scene, 1)) {
    const at = (x: number, y: number) => {
      const start = (y * pixels.width + x) * 4
      return [...pixels.data.slice(start, start + 4)]
    }
    expect(at(40, 40)[0]).toBeCloseTo(128, -1)
    expect(at(40, 40)[2]).toBeCloseTo(128, -1)
    expect(at(40, 40)[3]).toBeCloseTo(128, -1)
    expect(at(25, 40)).toEqual([0, 0, 255, 128])
    expect(at(15, 40)).toEqual([0, 0, 0, 0])
    expect(at(20, 20)).toEqual([0, 0, 0, 0])
  }
})
