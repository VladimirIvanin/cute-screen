import {
  createCanvas,
  loadImage,
} from '@napi-rs/canvas'
import {
  describe,
  expect,
  it,
} from 'vitest'
import { Canvas2DRenderer } from './backends/canvas2d/renderer'
import type { Canvas2DLike } from './backends/canvas2d/contracts'
import { horizontalRulerScene } from './precision-rendering.test-kit'

describe('ruler preview raster resolution', () => {
  it.each([1.3125, 2, 4])('rasterizes committed and draft labels directly at scale %s without changing export', async (scale) => {
    const scene = createCanvas(100, 60)
    const overlay = createCanvas(100, 60)
    const renderer = new Canvas2DRenderer({ exportCanvas: (w, h) => createCanvas(w, h) as unknown as Canvas2DLike })
    await renderer.initialize({ scene: scene as unknown as HTMLCanvasElement, overlay: overlay as unknown as HTMLCanvasElement, dpr: 2, correlationId: 'ruler-resolution' })
    const snapshot = horizontalRulerScene()
    renderer.setScene(snapshot)
    renderer.setOverlay(snapshot.nodes)
    const original = await renderer.exportPng()
    renderer.setPreviewScale(scale)
    renderer.render(['scene', 'overlay'])
    const expected = await loadImage(await renderer.exportPng({ scale }))
    const reference = createCanvas(expected.width, expected.height)
    reference.getContext('2d').drawImage(expected, 0, 0)
    expect([scene.width, scene.height]).toEqual([expected.width, expected.height])
    const pixels = reference.getContext('2d').getImageData(0, 0, expected.width, expected.height).data
    expect(scene.getContext('2d').getImageData(0, 0, scene.width, scene.height).data).toEqual(pixels)
    expect(overlay.getContext('2d').getImageData(0, 0, overlay.width, overlay.height).data).toEqual(pixels)
    expect(await renderer.exportPng()).toEqual(original)
    renderer.dispose()
  })
})
