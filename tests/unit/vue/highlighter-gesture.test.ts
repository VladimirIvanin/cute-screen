import {
  fireEvent,
  render,
} from '@testing-library/vue'
import { flushPromises } from '@vue/test-utils'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { createComposition } from '@cute-screen/editor-renderer'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import { CanvasRendererController } from '../../../packages/editor-vue/src/shell/canvas/renderer-controller'
import {
  canvasContext,
  documentFixture,
  prepareScene,
} from './m08-precision-test-kit'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())

describe('composition marker gesture lifecycle', () => {
  it.each(['Escape', 'blur', 'pointercancel'])('restores the scene on %s without creating a layer', async (cancel) => {
    const original = documentFixture()
    const document = { ...original, presentation: { ...original.presentation, composition: createComposition() } }
    const view = render(CanvasViewport, { props: {
      documentState: { kind: 'ready', title: 'Marker', dimensions: '120 × 80' },
      document, canvas: document.canvas, zoom: 100, fitMode: false, activeTool: 'marker', t: (key: string) => key,
    } })
    const scene = view.container.querySelector<HTMLCanvasElement>('.cs-canvas')!
    prepareScene(scene)
    await flushPromises()
    const redraw = vi.spyOn(CanvasRendererController.prototype, 'renderCommittedSceneForGesture')
    await fireEvent.pointerDown(scene, { pointerId: 1, clientX: 20, clientY: 30 })
    await fireEvent.pointerMove(scene, { pointerId: 1, clientX: 80, clientY: 35 })
    expect(redraw).toHaveBeenCalled()
    redraw.mockClear()
    await fireEvent.keyDown(scene, { key: 'Shift', shiftKey: true })
    expect(redraw).toHaveBeenCalledOnce()
    redraw.mockClear()
    if (cancel === 'Escape') await fireEvent.keyDown(scene, { key: 'Escape' })
    else if (cancel === 'blur') await fireEvent(window, new Event('blur'))
    else await fireEvent.pointerCancel(scene, { pointerId: 1 })
    await flushPromises()
    expect(redraw).toHaveBeenCalledOnce()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 80, clientY: 35 })
    expect(view.emitted('addLayer')).toBeUndefined()
    expect(document.layers).toEqual(original.layers)
  })
})
