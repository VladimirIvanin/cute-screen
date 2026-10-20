import {
  describe,
  it,
  expect,
} from 'vitest'
import {
  createCardBackground,
  createRenderSceneSnapshot,
} from '@cute-screen/editor-core'
import { prepareCompositionScene } from './freeform'
describe('freeform export preparation', () => {
  it('honors cancellation before allocating a raster even without Worker', async () => {
    const background = createCardBackground('freeform')
    const scene = createRenderSceneSnapshot({ width: 3840, height: 2160, nodes: [{ id: 'bg', kind: 'freeform',
      bounds: { x: 0, y: 0, width: 3840, height: 2160 }, points: background.freeform.points,
      opacity: 1, visible: true, rotation: 0 }] })
    const controller = new AbortController()
    controller.abort()
    await expect(prepareCompositionScene(scene, 1, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
