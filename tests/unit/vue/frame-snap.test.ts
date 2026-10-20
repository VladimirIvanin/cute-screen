import {
  describe,
  expect,
  it,
} from 'vitest'
import { fireEvent } from '@testing-library/vue'
import {
  createDrawingLayer,
  resizeLayerGeometry,
  type ShapeLayer,
} from '@cute-screen/editor-renderer'
import {
  mountViewport,
  document as viewportDocument,
} from './canvas-viewport-test-kit'
import {
  updateFrameResize,
  updateFrameMove,
} from '../../../packages/editor-vue/src/shell/canvas/frame-gesture'
import type { CanvasViewportProps } from '../../../packages/editor-vue/src/shell/canvas/contracts'

const shape = createDrawingLayer({ id: 'rectangle', tool: 'shape', start: { x: 20, y: 20 }, end: { x: 60, y: 60 } }) as ShapeLayer
const document = { ...viewportDocument, layers: [shape] }
const props: CanvasViewportProps = { document, zoom: 100,
  documentState: { kind: 'ready', title: 'Test', dimensions: '100 × 100' }, t: (key) => key }

describe('general frame magnets through canvas gestures', () => {
  it('holds the edges of an ordinary shape while moving and commits the pointerup once', async () => {
    const view = mountViewport('select', document, shape.id)
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 40, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 25, clientY: 25 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 32, clientY: 32 })
    expect(view.emitted('moveLayer')).toBeUndefined()
    await fireEvent.pointerUp(view.scene, { pointerId: 1, clientX: 33, clientY: 33 })
    expect(view.emitted('moveLayer')).toEqual([[shape.id, -18, -18, [shape.id]]])
  })

  it('snaps a side resize on pointerup without scaling the style', async () => {
    const view = mountViewport('select', document, shape.id)
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 60, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 85, clientY: 40 })
    expect(view.emitted('documentCommand')).toBeUndefined()
    await fireEvent.pointerUp(view.scene, { pointerId: 1, clientX: 96, clientY: 40 })
    const command = (view.emitted('documentCommand') as [{ after: ShapeLayer }][])![0]![0]
    expect(command.after.localBounds!.width).toBe(82)
    expect(command.after.transform).toEqual(shape.transform)
    expect(command.after.payload).toEqual(shape.payload)
  })

  it.each(['ctrlKey', 'metaKey'])('bypasses a resize with %s and cancels without history', async (modifier) => {
    const view = mountViewport('select', document, shape.id)
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 60, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 96, clientY: 40 })
    await fireEvent.pointerCancel(view.scene, { pointerId: 1 })
    expect(view.emitted('documentCommand')).toBeUndefined()
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 2, clientX: 60, clientY: 40 })
    await fireEvent.pointerMove(view.scene, { pointerId: 2, clientX: 96, clientY: 40, [modifier]: true })
    await fireEvent.pointerUp(view.scene, { pointerId: 2, clientX: 96, clientY: 40, [modifier]: true })
    const command = (view.emitted('documentCommand') as [{ after: ShapeLayer }][])![0]![0]
    expect(command.after.localBounds!.width).toBe(78)
  })

  it('moves a group by its common frame and preserves the distance between members', () => {
    const other = { ...shape, id: 'other', transform: { ...shape.transform, translateX: 50 } }
    const updated = updateFrameMove({ kind: 'move', id: shape.id, nodeIds: [shape.id, other.id],
      start: { x: 40, y: 40 }, current: { x: 40, y: 40 }, guides: [], guidesVisible: false },
    { x: 25, y: 25 }, { ...props, document: { ...document, layers: [shape, other] } }, true)!
    expect(updated.current).toEqual({ x: 22, y: 22 })
  })

  it('maps reflected bounds handles and leaves rotated resize unchanged', () => {
    const reflected = { ...shape, transform: { ...shape.transform, translateX: 60, scaleX: -1 } }
    const gesture = { kind: 'intrinsicResize' as const, id: shape.id, handle: 'e' as const,
      start: { x: 20, y: 40 }, current: { x: 20, y: 40 }, initial: reflected,
      preserveAspect: false, centerResize: false }
    const modifiers = { ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }
    const result = updateFrameResize(gesture, { x: 4, y: 40 }, props, modifiers)
    expect(result.current.x).toBe(0)
    const resized = resizeLayerGeometry(reflected, 'e', result.current)
    expect(resized.localBounds!.width).toBe(60)
    expect(resized.transform.translateX).toBe(60)
    const rotated = { ...reflected, transform: { ...reflected.transform, rotation: 30 } }
    expect(updateFrameResize({ ...gesture, initial: rotated },
      { x: 4, y: 40 }, props, modifiers).current.x).toBe(4)
  })

  it('does not snap a returned-to-origin move to the edge or to another object', () => {
    const nearby = { ...shape, id: 'other', transform: { ...shape.transform, translateX: 22 } }
    const gesture = { kind: 'move' as const, id: shape.id,
      start: { x: 22, y: 22 }, current: { x: 5, y: 5 }, dragging: true,
      guides: [], guidesVisible: false, frameSnap: { x: -18, y: -18 } }
    expect(updateFrameMove(gesture, gesture.start,
      { ...props, document: { ...document, layers: [shape, nearby] } }, true)!.current).toEqual(gesture.start)
  })

  it('uses the same crop move/resize magnet in Quick and commits one crop command', async () => {
    const cropped = { ...document, crop: { x: 20, y: 20, width: 40, height: 40 } }
    const view = mountViewport('select', cropped, '', undefined, false, undefined, undefined, true)
    await fireEvent.pointerDown(view.scene, { button: 0, pointerId: 1, clientX: 40, clientY: 20 })
    await fireEvent.pointerMove(view.scene, { pointerId: 1, clientX: 40, clientY: 5 })
    await fireEvent.pointerUp(view.scene, { pointerId: 1, clientX: 40, clientY: 4 })
    expect(view.emitted('documentCommand')).toEqual([[{ type: 'setCrop', before: cropped.crop,
      after: { x: 20, y: 0, width: 40, height: 60 } }]])
  })
})
