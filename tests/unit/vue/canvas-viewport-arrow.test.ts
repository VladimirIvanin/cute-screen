import { fireEvent } from '@testing-library/vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  rebaseArrowLayer,
  type ArrowLayer,
  type EditorDocumentV1,
} from '@cute-screen/editor-renderer'
import { document, mountViewport } from './canvas-viewport-test-kit'

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    arc: vi.fn(),
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    roundRect: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    setLineDash: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
})

describe('M05 CanvasViewport transforms', () => {
  it('returns to Select on Escape after an already-cancelled drawing draft', async () => {
    const { emitted } = mountViewport('shape')
    await fireEvent.keyDown(window, { key: 'Escape' })

    expect(emitted().selectTool).toEqual([['select']])
  })

  it('commits one arrow anchor payload update on handle release', async () => {
    const arrowDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'arrow',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 20, height: 10 },
          transform: {
            translateX: 10,
            translateY: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          blendMode: 'normal',
          shadows: [],
          visible: true,
          locked: false,
          payload: {
            path: 'straight',
            start: { x: 0, y: 0 },
            end: { x: 20, y: 10 },
            startCap: 'none',
            endCap: 'solidArrow',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const { scene, emitted } = mountViewport(undefined, arrowDocument, 'arrow')
    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 15,
      clientY: 15,
    })
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 15, clientY: 15 })

    const updates = emitted().documentCommand as unknown as
      | readonly [
          {
            readonly type: 'updateLayer'
            readonly after: EditorDocumentV1['layers'][number]
          },
        ][]
      | undefined
    expect(updates).toHaveLength(1)
    const after = updates?.[0]?.[0].after
    expect(updates?.[0]?.[0]).toMatchObject({
      type: 'updateLayer',
      before: { id: 'arrow' },
      after: { id: 'arrow', kind: 'arrow' },
    })
    if (!after) throw new Error('expected updated arrow layer')
    const afterPayload = after.payload as unknown as {
      readonly start: { readonly x: number; readonly y: number }
      readonly end: { readonly x: number; readonly y: number }
    }
    expect(after.transform.translateX + afterPayload.start.x).toBe(15)
    expect(after.transform.translateY + afterPayload.start.y).toBe(15)
    expect(after.transform.translateX + afterPayload.end.x).toBe(30)
    expect(after.transform.translateY + afterPayload.end.y).toBe(20)
    expect(emitted().updateLayerPayload).toBeUndefined()
  })

  it('commits one rebased elbow middle-segment update on pointer release', async () => {
    const elbowDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'elbow',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 100, height: 100 },
          transform: {
            translateX: 0,
            translateY: 0,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          blendMode: 'normal',
          shadows: [],
          visible: true,
          locked: false,
          payload: {
            path: 'elbow',
            start: { x: 10, y: 10 },
            end: { x: 90, y: 90 },
            elbow: { axis: 'y', offset: -10 },
            startCap: 'none',
            endCap: 'diamond',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 3,
              style: 'dashed',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const { scene, emitted } = mountViewport(undefined, elbowDocument, 'elbow')
    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 40,
      clientY: 50,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 60,
      clientY: 50,
    })
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 60, clientY: 50 })

    const commands = emitted().documentCommand as unknown as
      readonly [unknown][] | undefined
    const command = commands?.[0]?.[0] as
      | {
          readonly type: string
          readonly after: EditorDocumentV1['layers'][number]
        }
      | undefined
    expect(commands).toHaveLength(1)
    expect(command?.type).toBe('updateLayer')
    const afterPayload = command!.after.payload as unknown as {
      readonly start: { readonly x: number }
      readonly end: { readonly x: number }
      readonly elbow: { readonly offset: number }
    }
    expect(
      command!.after.transform.translateX +
        (afterPayload.start.x + afterPayload.end.x) / 2 +
        afterPayload.elbow.offset,
    ).toBe(60)
  })

  it('keeps a quadratic bend transient and commits it once on release', async () => {
    const quadraticDocument: EditorDocumentV1 = {
      ...document,
      layers: [
        {
          id: 'quadratic',
          kind: 'arrow',
          localBounds: { x: 0, y: 0, width: 40, height: 30 },
          transform: {
            translateX: 10,
            translateY: 10,
            rotation: 0,
            scaleX: 1,
            scaleY: 1,
          },
          opacity: 1,
          blendMode: 'normal',
          shadows: [],
          visible: true,
          locked: false,
          payload: {
            path: 'quadratic',
            start: { x: 0, y: 0 },
            end: { x: 20, y: 10 },
            bend: { x: 10, y: 0 },
            startCap: 'none',
            endCap: 'solidArrow',
            stroke: {
              color: { red: 1, green: 0, blue: 0, alpha: 1 },
              width: 2,
              style: 'solid',
              cap: 'round',
              join: 'round',
            },
          },
        },
      ],
    }
    const { scene, emitted } = mountViewport(
      undefined,
      quadraticDocument,
      'quadratic',
    )
    await fireEvent.pointerDown(scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 10,
    })
    await fireEvent.pointerMove(scene, {
      pointerId: 1,
      clientX: 20,
      clientY: 0,
    })
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, { pointerId: 1, clientX: 20, clientY: 0 })

    const commands = emitted().documentCommand as unknown as
      readonly [unknown][] | undefined
    expect(commands).toHaveLength(1)
    expect(commands?.[0]?.[0]).toMatchObject({
      type: 'updateLayer',
      before: { id: 'quadratic' },
      after: { id: 'quadratic', payload: { path: 'quadratic' } },
    })
  })

  it('draws the selection bounds expanded for a rebased 10 px Arrow cap', async () => {
    const before: ArrowLayer = {
      id: 'wide-cap',
      kind: 'arrow',
      localBounds: { x: 0, y: 0, width: 60, height: 20 },
      transform: {
        translateX: 10,
        translateY: 10,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
      },
      opacity: 1,
      blendMode: 'normal',
      shadows: [],
      visible: true,
      locked: false,
      payload: {
        path: 'straight',
        start: { x: 0, y: 0 },
        end: { x: 60, y: 20 },
        startCap: 'none',
        endCap: 'solidArrow',
        stroke: {
          color: { red: 1, green: 0, blue: 0, alpha: 1 },
          width: 3,
          style: 'solid',
          cap: 'round',
          join: 'round',
        },
      },
    }
    const after = rebaseArrowLayer(before, {
      ...before.payload,
      stroke: { ...before.payload.stroke, width: 10 },
    })
    const getContext = vi.mocked(HTMLCanvasElement.prototype.getContext)
    const context = window.document
      .createElement('canvas')
      .getContext('2d') as CanvasRenderingContext2D
    getContext.mockClear()
    vi.mocked(context.strokeRect).mockClear()
    mountViewport(undefined, { ...document, layers: [after] }, 'wide-cap')

    await vi.waitFor(() => {
      expect(context.strokeRect).toHaveBeenCalledWith(0, 0, 120, 80)
    })
  })
})
