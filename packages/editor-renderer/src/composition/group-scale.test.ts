import {
  describe,
  it,
  expect,
} from 'vitest'
import { createRenderSceneSnapshot } from '@cute-screen/editor-core'
import { groupRasterScale } from './group-scale'
describe('isolated composition surfaces', () => {
  it('bounds the full-source allocation when enlarging a tiny crop of an 8K image', () => {
    const scene = createRenderSceneSnapshot({ width: 7680, height: 4320,
      outputBounds: { x: 200, y: 200, width: 100, height: 100 }, nodes: [] })
    const density = groupRasterScale(scene, 1080, 2)
    expect(density).toBe(21.6)
    expect(scene.outputBounds.width * scene.outputBounds.height * density ** 2).toBeLessThanOrEqual(134217728)
    expect(groupRasterScale(scene, 50, 1)).toBe(0.5)
  })
})
