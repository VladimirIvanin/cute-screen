import {
  defineComponent,
  h,
  shallowReactive,
} from 'vue'
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createDrawingLayer,
  DEFAULT_GRADIENT_FILL,
  DEFAULT_DRAWING_DEFAULTS,
  type LayerNode,
  type ShapeLayer,
} from '@cute-screen/editor-renderer'
import {
  mountViewport,
  document as viewportDocument,
} from './canvas-viewport-test-kit'
import { GradientEditingController } from '../../../packages/editor-vue/src/shell/canvas/gradient-editing-controller'
import type {
  CanvasViewportEmit,
  CanvasViewportProps,
} from '../../../packages/editor-vue/src/shell/canvas/contracts'
import { gradientSchema } from '../../../packages/editor-vue/src/shell/tools/gradient-schema'
import ContextToolbar from '../../../packages/editor-vue/src/shell/components/ContextToolbar.vue'
import type { ContextToolbarSchema } from '../../../packages/editor-vue/src/shell/types'

function gradient() {
  return createDrawingLayer({ id: 'gradient',
    tool: 'gradient',
    start: { x: 10,
      y: 10 },
    end: { x: 90,
      y: 90 } }) as ShapeLayer
}
function editingHarness() {
  const layer = gradient()
  const props = shallowReactive({ documentState: { kind: 'ready',
    title: 'Test',
    dimensions: '100 × 100' },
  t: (key: string) => key,
  document: { ...viewportDocument,
    layers: [layer] },
  activeTool: 'select',
  selectedLayerId: 'gradient',
  selectedLayerIds: ['gradient'],
  zoom: 100,
  readOnly: false } as CanvasViewportProps)
  const emit = vi.fn(), repaint = vi.fn()
  const scene = document.createElement('canvas')
  scene.setPointerCapture = vi.fn()
  scene.hasPointerCapture = vi.fn(() => true)
  scene.releasePointerCapture = vi.fn()
  let controller!: GradientEditingController
  const view = render(defineComponent({ setup() {
    controller = new GradientEditingController({ props, emit: emit as CanvasViewportEmit, scene: () => scene,
      point: (event) => ({ x: event.clientX, y: event.clientY }), render: repaint, invalidate: repaint })
    controller.state.mode.value = 'transition'
    return () => h('div')
  } }))
  const event = (x: number,
    y: number,
    shiftKey = false) => new PointerEvent('pointermove',
    { button: 0,
      pointerId: 1,
      clientX: x,
      clientY: y,
      shiftKey })
  return { controller, emit, layer, props, event, view, repaint }
}
const schema: ContextToolbarSchema = {
  icon: 'gradient', title: 'Gradient', hint: '', shape: { fill: DEFAULT_GRADIENT_FILL },
  controls: [{ kind: 'range', id: 'layerOpacity', label: 'Opacity', value: 100, min: 0, max: 100, step: 1 },
    { kind: 'action', id: 'gradientFitWidth', label: 'Full width' },
    { kind: 'action', id: 'gradientFitHeight', label: 'Full height' }],
}
describe('gradient backdrop interactions', () => {
  function movingViewport() {
    const layer = createDrawingLayer({ id: 'gradient', tool: 'gradient',
      start: { x: 20, y: 20 }, end: { x: 60, y: 60 } }) as ShapeLayer
    return mountViewport('select', { ...viewportDocument, layers: [layer] }, layer.id)
  }

  it('holds the layer edges at a corner during preview and commits the final held delta once', async () => {
    const view = movingViewport()
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 25, clientY: 25 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 32, clientY: 32 })
    expect(view.emitted('moveLayer')).toBeUndefined()
    await fireEvent.pointerUp(view.scene, { pointerId: 1, clientX: 33, clientY: 33 })
    expect(view.emitted('moveLayer')).toEqual([['gradient', -20, -20, ['gradient']]])
    expect(view.emitted('documentCommand')).toBeUndefined()
  })

  it('releases at pointerup, cancels without a command and starts the next drag without a stale magnet', async () => {
    const view = movingViewport()
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 25, clientY: 25 })
    await fireEvent.pointerCancel(view.scene, { pointerId: 1 })
    expect(view.emitted('moveLayer')).toBeUndefined()
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 2, clientX: 40, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 2, clientX: 32, clientY: 32 })
    await fireEvent.pointerUp(view.scene, { pointerId: 2, clientX: 32, clientY: 32 })
    expect(view.emitted('moveLayer')).toEqual([['gradient', -8, -8, ['gradient']]])
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 3, clientX: 40, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 3, clientX: 25, clientY: 25 })
    await fireEvent.pointerUp(view.scene, { pointerId: 3, clientX: 35, clientY: 35 })
    expect(view.emitted('moveLayer').at(-1)).toEqual(['gradient', -5, -5, ['gradient']])
  })

  it.each(['ctrlKey', 'metaKey'])('bypasses a captured edge with %s', async (modifier) => {
    const view = movingViewport()
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 25, clientY: 25 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 32, clientY: 32, [modifier]: true })
    await fireEvent.pointerUp(view.scene, { pointerId: 1, clientX: 32, clientY: 32, [modifier]: true })
    expect(view.emitted('moveLayer')).toEqual([['gradient', -8, -8, ['gradient']]])
  })

  it('does not add movement for a click, a returned-to-origin drag or Escape', async () => {
    const view = movingViewport()
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    await fireEvent.pointerUp(view.scene, { pointerId: 1, clientX: 40, clientY: 40 })
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 2, clientX: 40, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 2, clientX: 25, clientY: 25 })
    await fireEvent.pointerUp(view.scene, { pointerId: 2, clientX: 40, clientY: 40 })
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 3, clientX: 40, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 3, clientX: 25, clientY: 25 })
    await fireEvent.keyDown(window, { key: 'Escape' })
    await fireEvent.pointerUp(view.scene, { pointerId: 3, clientX: 25, clientY: 25 })
    expect(view.emitted('moveLayer')).toBeUndefined()
  })

  it('creates a transient snapped draft and commits the release coordinates only once', async () => {
    const view = mountViewport('gradient', { ...viewportDocument, layers: [] }, '')
    await view.rerender({ drawingDefaults: DEFAULT_DRAWING_DEFAULTS })
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 3, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 70, clientY: 80 })
    expect(view.emitted('addLayer')).toBeUndefined()
    await fireEvent.pointerUp(view.scene, { pointerId: 1, clientX: 97, clientY: 98 })
    const created = (view.emitted('addLayer')[0] as [LayerNode])[0]
    expect(created).toMatchObject(
      { kind: 'shape',
        transform: { translateX: 0,
          translateY: 40 },
        localBounds: { width: 100,
          height: 60 },
        payload: { annotationTool: 'gradient' } })
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 2, clientX: 20, clientY: 20 })
    await fireEvent.pointerMove(view.scene, { pointerId: 2, clientX: 80, clientY: 80 })
    await fireEvent.pointerCancel(view.scene, { pointerId: 2 })
    expect(view.emitted('addLayer')).toHaveLength(1)
  })
  it('commits a handle edit once, cancels Escape and never changes the original during preview', () => {
    const { controller, emit, layer, event } = editingHarness()
    expect(controller.pointerDown(event(50, 10))).toBe(true)
    controller.pointerMove(event(80, 40, true))
    expect(emit).not.toHaveBeenCalled()
    expect(layer.payload.fill).toEqual(DEFAULT_GRADIENT_FILL)
    expect(controller.preview()).toBeDefined()
    controller.pointerUp(event(80, 40, true))
    expect(emit).toHaveBeenCalledTimes(1)
    expect(emit.mock.calls[0]?.[0]).toBe('documentCommand')
    controller.pointerDown(event(50, 10))
    controller.pointerMove(event(20, 10))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(controller.preview()).toBeUndefined()
    expect(emit).toHaveBeenCalledTimes(1)
  })
  it('moves the transition independently and rejects locked/read-only and stale selection input', async () => {
    const { controller, emit, props, event } = editingHarness()
    controller.pointerDown(event(50, 50))
    controller.pointerMove(event(60, 55))
    controller.pointerUp(event(60, 55))
    expect(emit.mock.calls[0]?.[1]).toMatchObject(
      { after: { localBounds: { width: 80, height: 80 }, payload: { fill: { start: { x: .625, y: 1.0625 } } } } })
    props.readOnly = true
    expect(controller.pointerDown(event(50, 10))).toBe(false)
    props.readOnly = false
    controller.pointerDown(event(50, 10))
    props.selectedLayerId = 'other'
    await Promise.resolve()
    expect(controller.preview()).toBeUndefined()
  })
  it('shows the full editor, restores focus on Escape and disables locked controls', async () => {
    const view = render(ContextToolbar, { props: { schema, label: 'Gradient', pickerLocale: 'en' } })
    const trigger = screen.getByRole('button', { name: 'Gradient settings' })
    await fireEvent.click(trigger)
    expect(screen.getByRole('spinbutton', { name: 'Stop opacity' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rotate 90°' })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: 'Reset gradient' }))
    expect(view.emitted('change').at(-1)).toEqual(['gradientReset', 'true'])
    await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Gradient settings' }), { key: 'Escape' })
    expect(trigger).toHaveFocus()
    await view.rerender({ schema: { ...schema, disabled: true } })
    expect(trigger).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Transition' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Placement' })).toBeDisabled()
  })
  it('offers graphic frame placement, keeps the popup open for combinations and restores focus', async () => {
    const value = gradientSchema({ document: viewportDocument, layer: gradient(),
      values: gradient().payload, disabled: false, defaultsOnly: false, count: 1,
      translate: (key) => key })
    const view = render(ContextToolbar, { props: { schema: value, label: 'Gradient', pickerLocale: 'en' } })
    const trigger = screen.getByRole('button', { name: 'Placement' })
    await fireEvent.click(trigger)
    expect(document.querySelectorAll('[data-gradient-placement]')).toHaveLength(8)
    const first = screen.getByRole('button', { name: 'gradientAlignLeft' })
    expect(first).toHaveFocus()
    await fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: 'gradientAlignTop' })).toHaveFocus()
    await fireEvent.click(screen.getByRole('button', { name: 'gradientAlignBottom' }))
    expect(view.emitted('action').at(-1)).toEqual(['gradientAlignBottom'])
    expect(screen.getByRole('dialog', { name: 'Placement' })).toBeInTheDocument()
    await fireEvent.keyDown(screen.getByRole('dialog', { name: 'Placement' }), { key: 'Escape' })
    expect(trigger).toHaveFocus()
    const rotated = { ...gradient(), transform: { ...gradient().transform, rotation: 45 } }
    await view.rerender({ schema: gradientSchema({ document: viewportDocument, layer: rotated,
      values: rotated.payload, disabled: false, defaultsOnly: false, count: 1, translate: (key) => key }) })
    await fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: 'gradientAlignBottom' })).toBeDisabled()
    expect(screen.getByText('gradientResetRotation')).toBeInTheDocument()
  })

})
