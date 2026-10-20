import {
  expect,
  it,
} from 'vitest'
import {
  createRenderSceneSnapshot,
  type RenderGroupNode,
} from '@cute-screen/editor-core'
import { createCanvas } from '@napi-rs/canvas'
import type { Canvas2DLike } from '../backends/canvas2d/contracts'
import {
  EffectCache,
  EffectFrame,
} from '../effects/runtime'
import { compositeBackdrop2D } from './canvas2d-backdrop'
import { groupBackdropGeometry } from './group-backdrop'

function group(): RenderGroupNode {
  return { id: 'screen', kind: 'group', visible: true, opacity: 1, rotation: 0, blur: 0, cornerRadius: 8,
    scene: createRenderSceneSnapshot({ width: 40, height: 30, nodes: [] }),
    destination: { x: 18.3, y: 24.7, width: 40, height: 30 },
    clip: { x: 10.2, y: 15.8, width: 60.6, height: 50.1 },
    backdrop: { red: 1, green: 0, blue: 0, alpha: 0.5 } }
}

it('bounds screen surfaces including the gutter for large exports and tiny previews', () => {
  for (const [width, height] of [[32768, 32768], [1, 32768], [0.01, 0.01], [8000, 4000]]) {
    for (const scale of [0.001, 1, 2, 16]) {
      const node = group()
      const geometry = groupBackdropGeometry({ ...node, clip: { ...node.clip, width: width!, height: height! } }, scale)
      expect(geometry.width).toBeLessThanOrEqual(32768)
      expect(geometry.height).toBeLessThanOrEqual(32768)
      expect(geometry.width * geometry.height).toBeLessThanOrEqual(134217728)
      expect(geometry.width).toBeGreaterThanOrEqual(3)
      expect(geometry.height).toBeGreaterThanOrEqual(3)
    }
  }
})

it('reuses the screen for clip radius and opacity, invalidates fill/position, and releases it on dispose', () => {
  const cache = new EffectCache()
  const frame = new EffectFrame(cache)
  const source = createCanvas(40, 30) as unknown as Canvas2DLike
  const canvases: Canvas2DLike[] = []
  const make = (width: number, height: number) => {
    const canvas = createCanvas(width, height) as unknown as Canvas2DLike
    canvases.push(canvas)
    return canvas
  }
  const node = group()
  const first = compositeBackdrop2D(source, 'source', node, 1.25, make, frame)
  const reused = compositeBackdrop2D(source, 'source', { ...node, cornerRadius: 15, opacity: 0.4 }, 1.25, make, frame)
  expect(reused.canvas).toBe(first.canvas)
  const moved = compositeBackdrop2D(source, 'source', { ...node, destination: { ...node.destination, x: 20 } }, 1.25, make, frame)
  expect(moved.canvas).not.toBe(first.canvas)
  const recolored = compositeBackdrop2D(source, 'source', { ...node, backdrop: { ...node.backdrop!, red: 0 } }, 1.25, make, frame)
  expect(recolored.canvas).not.toBe(first.canvas)
  const pixels = first.canvas.getContext('2d')!.getImageData(0, 0, first.canvas.width, first.canvas.height).data
  expect([...pixels.slice(0, 3)]).toEqual([255, 0, 0])
  expect(pixels[3]).toBeGreaterThanOrEqual(127)
  expect(pixels[3]).toBeLessThanOrEqual(128)
  const inner = (first.canvas.width + 1) * 4
  expect([...pixels.slice(0, 4)]).toEqual([...pixels.slice(inner, inner + 4)])
  frame.dispose()
  cache.clear()
  expect(canvases.every((canvas) => canvas.width === 1 && canvas.height === 1)).toBe(true)
})
