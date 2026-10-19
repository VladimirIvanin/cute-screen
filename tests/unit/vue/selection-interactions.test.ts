import {
  fireEvent,
  render,
  waitFor,
} from '@testing-library/vue'
import { markRaw } from 'vue'
import {
  createEditorShellPinia,
  useEditorShellStore,
} from '@cute-screen/editor-vue'
import EditorShell from '../../../packages/editor-vue/src/shell/components/EditorShell.vue'
import { arrowSession } from './app-test-kit'
import {
  canvasContext,
  prepareScene,
} from './m08-precision-test-kit'
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createDrawingLayer,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import {
  document as fixture,
  mountViewport,
} from './canvas-viewport-test-kit'

const arrow = createDrawingLayer({ id: 'arrow', tool: 'arrow', start: { x: 20, y: 30 }, end: { x: 80, y: 70 } })!
const doc: EditorDocumentV1 = { ...fixture, layers: [arrow] }
const down = (x: number, y: number) => ({ pointerId: 1, button: 0, clientX: x, clientY: y })
const move = (x: number, y: number) => ({ ...down(x, y), ctrlKey: true })

beforeEach(() => {
  const context = new Proxy({}, { get: (_target, key) => key === 'measureText'
    ? () => ({ width: 20 }) : vi.fn() })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as CanvasRenderingContext2D)
})

describe('canvas selection targets', () => {
  it.each([false, true])('moves through the production parent and exposed grip route (grip=%s)', async (grip) => {
    localStorage.clear()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext())
    const session = arrowSession({ ...fixture, layers: [] })
    const pinia = createEditorShellPinia()
    const view = render(EditorShell, { props: { documentSession: markRaw(session) }, global: { plugins: [pinia] } })
    const scene = view.getByLabelText('Scene canvas') as HTMLCanvasElement
    prepareScene(scene)
    try {
      await fireEvent.click(view.getByRole('button', { name: grip ? 'Shape' : 'Arrow' }))
      await fireEvent.pointerDown(scene, down(20, 20))
      await fireEvent.pointerMove(scene, down(grip ? 28 : 75, grip ? 28 : 55))
      await fireEvent.pointerUp(scene, down(grip ? 28 : 75, grip ? 28 : 55))
      const store = useEditorShellStore(pinia)
      expect(store.selectedLayerIds).toHaveLength(1)
      const before = session.snapshot.core.document.layers.at(-1)!
      const execute = vi.spyOn(session, 'execute')
      if (grip) {
        await waitFor(() => expect(view.container.querySelector('.cs-selection-move-grip')).not.toBeNull())
        const button = view.container.querySelector('.cs-selection-move-grip')!
        await fireEvent.pointerDown(button, down(-30, -20))
        await fireEvent.pointerMove(scene, move(-15, -10))
        await fireEvent.pointerUp(scene, down(-15, -10))
      } else {
        await fireEvent.pointerDown(scene, down(95, 5))
        await fireEvent.pointerUp(scene, down(95, 5))
        expect(store.selectedLayerIds).toEqual([])
        await fireEvent.pointerDown(scene, down(47, 43))
        await fireEvent.pointerMove(scene, move(62, 53))
        await fireEvent.pointerUp(scene, down(62, 53))
      }
      expect(execute).toHaveBeenCalledTimes(1)
      const after = session.snapshot.core.document.layers.at(-1)!
      expect(after.payload).toEqual(before.payload)
      expect(after.transform).not.toEqual(before.transform)
    } finally {
      view.unmount()
      session.dispose()
    }
  })
  it('starts one whole-object move from the padded contour before any selection exists', async () => {
    const { scene, emitted } = mountViewport('select', doc, '')
    await fireEvent.pointerMove(scene, down(50, 55))
    expect(scene.style.cursor).toBe('move')
    await fireEvent.pointerDown(scene, down(50, 55))
    await fireEvent.pointerMove(scene, move(60, 65))
    await fireEvent.pointerUp(scene, down(60, 65))
    expect(emitted().selectLayer).toEqual([['arrow', false]])
    expect(emitted().moveLayer).toEqual([['arrow', 10, 10, ['arrow']]])
    expect(emitted().updateLayerPayload).toBeUndefined()
  })
  it('does not use a future frame before selecting, and does use it afterwards', async () => {
    const { scene, emitted, rerender } = mountViewport('select', doc, '')
    await fireEvent.pointerDown(scene, down(35, 65))
    await fireEvent.pointerUp(scene, down(35, 65))
    expect(emitted().selectLayer).toBeUndefined()
    await rerender({ selectedLayerId: 'arrow' })
    await fireEvent.pointerMove(scene, down(35, 65))
    expect(scene.style.cursor).toBe('move')
    await fireEvent.pointerDown(scene, down(35, 65))
    await fireEvent.pointerMove(scene, move(45, 75))
    await fireEvent.pointerUp(scene, down(45, 75))
    expect(emitted().moveLayer).toEqual([['arrow', 10, 10, ['arrow']]])
  })
  it('ignores click jitter and cancels a move without committing', async () => {
    const { scene, emitted } = mountViewport('select', doc, 'arrow')
    await fireEvent.pointerDown(scene, down(35, 65))
    await fireEvent.pointerMove(scene, move(37, 66))
    await fireEvent.pointerUp(scene, down(37, 66))
    expect(emitted().moveLayer).toBeUndefined()
    await fireEvent.pointerDown(scene, down(35, 65))
    await fireEvent.pointerMove(scene, move(55, 75))
    await fireEvent.pointerCancel(scene, down(55, 75))
    expect(emitted().moveLayer).toBeUndefined()
    await fireEvent.pointerDown(scene, down(35, 65))
    await fireEvent.pointerMove(scene, move(55, 75))
    await fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' })
    await fireEvent.pointerUp(scene, down(55, 75))
    expect(emitted().moveLayer).toBeUndefined()
  })
  it('edits a visible endpoint but moves the whole unselected arrow from the same position', async () => {
    const { scene, emitted, rerender } = mountViewport('select', doc, '')
    await fireEvent.pointerDown(scene, down(20, 30))
    await fireEvent.pointerMove(scene, move(30, 40))
    await fireEvent.pointerUp(scene, down(30, 40))
    expect(emitted().moveLayer).toHaveLength(1)
    await rerender({ selectedLayerId: 'arrow' })
    await fireEvent.pointerMove(scene, down(20, 30))
    expect(scene.style.cursor).toBe('crosshair')
    await fireEvent.pointerDown(scene, down(20, 30))
    await fireEvent.pointerMove(scene, move(30, 40))
    await fireEvent.pointerUp(scene, down(30, 40))
    expect(emitted().moveLayer).toHaveLength(1)
    expect(emitted().documentCommand).toHaveLength(1)
  })
  it('moves an entire multiple selection from a gap in its common frame', async () => {
    const second = { ...arrow, id: 'second', transform: { ...arrow.transform, translateX: 25, translateY: 25 } }
    const { scene, emitted, rerender } = mountViewport('select', { ...doc, layers: [arrow, second] }, '')
    await rerender({ selectedLayerId: undefined, selectedLayerIds: ['arrow', 'second'] })
    await fireEvent.pointerDown(scene, down(50, 80))
    await fireEvent.pointerMove(scene, move(60, 85))
    await fireEvent.pointerUp(scene, down(60, 85))
    expect(emitted().moveLayer).toEqual([['arrow', 10, 5, ['arrow', 'second']]])
    expect(emitted().selectLayer).toBeUndefined()
  })
  it('keeps active drawing tools and read-only documents out of selection dragging', async () => {
    const { scene, emitted, rerender } = mountViewport('shape', doc, 'arrow')
    await fireEvent.pointerDown(scene, down(35, 65))
    await fireEvent.pointerMove(scene, move(55, 75))
    await fireEvent.pointerUp(scene, down(55, 75))
    expect(emitted().addLayer).toHaveLength(1)
    expect(emitted().moveLayer).toBeUndefined()
    await rerender({ activeTool: 'select', readOnly: true })
    await fireEvent.pointerDown(scene, down(35, 65))
    await fireEvent.pointerMove(scene, move(55, 75))
    await fireEvent.pointerUp(scene, down(55, 75))
    expect(emitted().moveLayer).toBeUndefined()
  })
})
