import CanvasKitInit from 'canvaskit-wasm'
import path from 'node:path'
import {
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest'
import {
  createRenderSceneSnapshot,
  type RenderSpotlightNode,
} from '@cute-screen/editor-core'
import type { CanvasKitApi } from './backends/canvaskit/contracts'
import { renderHeadlessCanvasKitPng } from './backends/canvaskit/renderer'
import {
  canvas2dPng,
  decodedPixels,
  pixel,
  rect,
  expectPixelClose,
} from './precision-rendering.test-kit'

const spotlight: RenderSpotlightNode = {
  kind: 'spotlight',
  id: 'spotlight',
  bounds: { x: 20, y: 20, width: 120, height: 60 },
  apertures: [
    { shape: 'rectangle', x: 20, y: 20, width: 80, height: 60 },
    { shape: 'ellipse', x: 60, y: 20, width: 80, height: 60 },
  ],
  dimColor: { red: 0, green: 0, blue: 0, alpha: 1 },
  dimOpacity: .65,
  feather: null,
  opacity: 1,
  visible: true,
  rotation: 0,
}

describe('composite spotlight union pixels', () => {
  let kit: CanvasKitApi
  beforeAll(async () => {
    kit = await CanvasKitInit({
      locateFile: () => path.resolve('packages/editor-renderer/node_modules/canvaskit-wasm/bin/canvaskit.wasm'),
    }) as CanvasKitApi
  })
  it.each(['canvas2d', 'canvaskit'] as const)('%s dims once, preserves intersections and unions soft edges at 1×/2×', async (backend) => {
    for (const scale of [1, 2]) {
      for (const feather of [null, 'soft', 'strong'] as const) {
        const node = { ...spotlight, feather }
        const scene = (value: RenderSpotlightNode) => createRenderSceneSnapshot({
          width: 180,
          height: 120,
          nodes: [rect('background', 0, 0, 180, 120, [1, 1, 1, 1]), value],
        })
        const render = async (value: RenderSpotlightNode) => decodedPixels(backend === 'canvas2d'
          ? await canvas2dPng(scene(value), { scale })
          : renderHeadlessCanvasKitPng(kit, scene(value), [], { scale }))
        const decoded = await render(node)
        expectPixelClose(pixel(decoded, 80 * scale, 50 * scale), [255, 255, 255, 255], feather === 'strong' ? 25 : 3)
        expectPixelClose(pixel(decoded, 40 * scale, 50 * scale), [255, 255, 255, 255], feather === 'strong' ? 25 : 3)
        expectPixelClose(pixel(decoded, 120 * scale, 50 * scale), [255, 255, 255, 255], feather === 'strong' ? 25 : 3)
        expectPixelClose(pixel(decoded, 170 * scale, 110 * scale), [89, 89, 89, 255], 1)
        const duplicate = await render({ ...node, apertures: [...node.apertures, node.apertures[0]!] })
        expect(Array.from(duplicate.data)).toEqual(Array.from(decoded.data))
      }
    }
  })
  it.each(['canvas2d', 'canvaskit'] as const)('%s rotates all apertures together and composes separate spotlight layers', async (backend) => {
    const node = { ...spotlight, id: 'rotated', rotation: 90 }
    const scene = createRenderSceneSnapshot({
      width: 180, height: 120,
      nodes: [
        rect('background', 0, 0, 180, 120, [1, 1, 1, 1]),
        node,
        { ...node, id: 'second-layer', rotation: 0 },
      ],
    })
    const decoded = await decodedPixels(backend === 'canvas2d'
      ? await canvas2dPng(scene)
      : renderHeadlessCanvasKitPng(kit, scene, []))
    expectPixelClose(pixel(decoded, 80, 50), [255, 255, 255, 255], 1)
    expectPixelClose(pixel(decoded, 130, 50), [89, 89, 89, 255], 1)
    expectPixelClose(pixel(decoded, 80, 100), [89, 89, 89, 255], 1)
    expectPixelClose(pixel(decoded, 170, 110), [31, 31, 31, 255], 1)
  })
})
