import {
  fireEvent,
  render,
} from '@testing-library/vue'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  DEFAULT_DRAWING_DEFAULTS,
  type PencilLayer,
  type PencilLayerPayload,
} from '@cute-screen/editor-core'
import CanvasViewport from '../../../packages/editor-vue/src/shell/components/CanvasViewport.vue'
import {
  canvasContext,
  documentFixture,
  prepareScene,
} from './m08-precision-test-kit'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
})
afterEach(() => vi.restoreAllMocks())

function mount(
  tool: 'pencil' | 'marker',
  brush = 'stabilized',
) {
  const view = render(CanvasViewport, { props: {
    documentState: { kind: 'ready', title: 'Ink', dimensions: '120 × 80' },
    document: documentFixture(), canvas: { width: 120, height: 80 }, zoom: 100, fitMode: false,
    t: (key: string) => key, activeTool: tool,
    drawingDefaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil, brush } },
  } })
  const scene = view.container.querySelector<HTMLCanvasElement>('.cs-canvas')!
  prepareScene(scene)
  const layer = () => (view.emitted('addLayer') as unknown[][])[0]![0] as PencilLayer
  return { view, scene, layer }
}

describe('Shift compound stroke input', () => {
  it.each(['marker', 'pen', 'stabilized', 'brush'])('creates one %s stroke across key-only transitions and coalesced input', async (kind) => {
    const { view, scene, layer } = mount(kind === 'marker' ? 'marker' : 'pencil', kind)
    await fireEvent.pointerDown(scene, { pointerId: 2, clientX: 10, clientY: 20, pointerType: 'pen', pressure: .7 })
    await fireEvent.pointerMove(scene, { pointerId: 2, clientX: 30, clientY: 30, pointerType: 'pen', pressure: .4 })
    await fireEvent.keyDown(scene, { key: 'Shift', code: 'ShiftRight', shiftKey: true })
    const move = new PointerEvent('pointermove', { pointerId: 2, clientX: 80, clientY: 34,
      pointerType: 'pen', pressure: .9, shiftKey: true, bubbles: true })
    Object.defineProperty(move, 'getCoalescedEvents', { value: () => [
      new PointerEvent('pointermove', { clientX: 50, clientY: 32, pointerType: 'pen', pressure: .6 }),
      new PointerEvent('pointermove', { clientX: 80, clientY: 34, pointerType: 'pen', pressure: .9 }),
    ] })
    await fireEvent(scene, move)
    await fireEvent.keyUp(scene, { key: 'Shift', code: 'ShiftRight', shiftKey: false })
    expect(view.emitted('addLayer')).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 2, clientX: 90, clientY: 44, pointerType: 'pen', pressure: 0 })
    expect(view.emitted('addLayer')).toHaveLength(1)
    const result = layer()
    const world = (result.payload as PencilLayerPayload).points.map((p) => ({ ...p,
      x: p.x + result.transform.translateX, y: p.y + result.transform.translateY }))
    expect(world.slice(0, 2).map(({ x, y }) => ({ x, y }))).toEqual([{ x: 10, y: 20 }, { x: 30, y: 30 }])
    expect(world[0]!.pressure).toBeCloseTo(.7)
    expect(world[1]!.pressure).toBeCloseTo(.4)
    expect(world.slice(1, -1).every((p) => p.y === 30)).toBe(true)
    expect(world.at(-1)!.y).toBe(40)
    expect(world.at(-1)!.x - world.at(-2)!.x).toBeCloseTo(10)
    expect(world.at(-1)!.pressure).toBeCloseTo(.9)
    if (kind === 'marker') expect(result.payload.strokeVersion).toBeUndefined()
    else expect(result.payload).toMatchObject({ strokeVersion: 3, straightSegments: [{ start: 1, end: 3 }] })
  })
  it('starts constrained with Shift and handles a release position without a move', async () => {
    const { scene, layer } = mount('pencil')
    await fireEvent.pointerDown(scene, { pointerId: 1, clientX: 10, clientY: 20, shiftKey: true })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 80, clientY: 23, shiftKey: true })
    const points = (layer().payload as PencilLayerPayload).points
    expect(points.at(-1)!.y).toBe(points[0]!.y)
    expect(layer().payload.strokeVersion).toBe(3)
  })
  it.each(['scene', 'window'])('consumes Escape from %s before an earlier Quick window listener', async (target) => {
    const close = vi.fn()
    const outerKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', outerKeydown)
    try {
      const { view, scene } = mount('marker')
      await fireEvent.pointerDown(scene, { pointerId: 1, clientX: 10, clientY: 20, shiftKey: true })
      await fireEvent.pointerMove(scene, { pointerId: 1, clientX: 80, clientY: 23, shiftKey: true })
      await fireEvent.keyDown(target === 'scene' ? scene : window, { key: 'Escape', shiftKey: true })
      await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 80, clientY: 23 })
      expect(close).not.toHaveBeenCalled()
      expect(view.emitted('addLayer')).toBeUndefined()
    } finally {
      window.removeEventListener('keydown', outerKeydown)
    }
  })
  it('keeps the constraint until both Shift keys are released', async () => {
    const { scene, layer } = mount('pencil')
    await fireEvent.pointerDown(scene, { pointerId: 1, clientX: 10, clientY: 20, shiftKey: true })
    await fireEvent.keyDown(scene, { key: 'Shift', code: 'ShiftRight', shiftKey: true })
    await fireEvent.keyUp(scene, { key: 'Shift', code: 'ShiftLeft', shiftKey: true })
    await fireEvent.pointerMove(scene, { pointerId: 1, clientX: 80, clientY: 23, shiftKey: true })
    await fireEvent.keyUp(scene, { key: 'Shift', code: 'ShiftRight', shiftKey: false })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 90, clientY: 33 })
    const payload = layer().payload as PencilLayerPayload
    expect(payload.straightSegments).toEqual([{ start: 0, end: 1 }])
    expect(payload.points[0]!.y).toBe(payload.points[1]!.y)
    expect(payload.points.at(-1)!.y - payload.points[1]!.y).toBe(10)
  })
  it.each(['escape', 'blur', 'pointerCancel'])('cancels constrained drawing on %s', async (cancel) => {
    const { view, scene } = mount('pencil')
    await fireEvent.pointerDown(scene, { pointerId: 1, clientX: 10, clientY: 20, shiftKey: true })
    await fireEvent.pointerMove(scene, { pointerId: 1, clientX: 80, clientY: 23, shiftKey: true })
    if (cancel === 'escape') await fireEvent.keyDown(scene, { key: 'Escape' })
    else if (cancel === 'blur') await fireEvent(window, new Event('blur'))
    else await fireEvent.pointerCancel(scene, { pointerId: 1 })
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 80, clientY: 23 })
    expect(view.emitted('addLayer')).toBeUndefined()
  })
})
