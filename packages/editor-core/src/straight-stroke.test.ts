import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  beginStroke,
  moveStroke,
  setStrokeStraight,
} from './tools/straight-stroke'
import { resolveFreehandGeometry } from './tools/freehand'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import { parseSampledPayload } from './document/codec/paint'
import { applyLayerStyle } from './styles'
import { resizeLayerGeometry } from './layer-resize'
import { CommandManager } from './commands/manager'
import { withLayers } from './precision-tools.test-kit'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import type {
  PencilLayer,
  PencilLayerPayload,
} from './document/types'

const origin = { x: 10, y: 20, pressure: .7 }
const mixed = () => {
  let state = moveStroke(beginStroke(origin, false), { x: 30, y: 33, pressure: .4 })
  state = setStrokeStraight(state, true)
  state = moveStroke(state, { x: 80, y: 39, pressure: .9 })
  state = setStrokeStraight(state, false)
  return moveStroke(state, { x: 100, y: 49, pressure: .6 })
}
const pencil = (brush: string) => {
  const state = mixed()
  return createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000019', tool: 'pencil',
    start: origin, end: state.points.at(-1)!, points: state.points, straightSegments: state.straightSegments,
    defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: { ...DEFAULT_DRAWING_DEFAULTS.pencil, brush, pressureMode: 'pen' } },
  }) as PencilLayer
}

describe('compound freehand and straight strokes', () => {
  it.each(Array.from({ length: 8 }, (_, i) => i))('snaps direction %i and preserves length', (i) => {
    const angle = i * Math.PI / 4 + .08
    const state = moveStroke(beginStroke(origin, true), { x: origin.x + Math.cos(angle) * 70,
      y: origin.y + Math.sin(angle) * 70, pressure: .8 })
    const end = state.points.at(-1)!
    expect(end.x).toBeCloseTo(origin.x + Math.cos(i * Math.PI / 4) * 70)
    expect(end.y).toBeCloseTo(origin.y + Math.sin(i * Math.PI / 4) * 70)
    expect(state.straightSegments).toEqual([{ start: 0, end: 1 }])
    expect(end.pressure).toBe(.8)
  })
  it('keeps the free prefix, replaces the active line, and resumes without a jump', () => {
    let state = moveStroke(beginStroke(origin, false), { x: 30, y: 33, pressure: .4 })
    const prefix = state.points
    state = setStrokeStraight(state, true)
    state = moveStroke(state, { x: 70, y: 36, pressure: .8 })
    state = moveStroke(state, { x: 80, y: 39, pressure: .9 })
    expect(state.points.slice(0, 2)).toEqual(prefix)
    expect(state.points.slice(1).every((p) => p.y === 33)).toBe(true)
    const end = state.points.at(-1)!
    state = setStrokeStraight(state, false)
    const released = state.points
    state = moveStroke(state, { x: 80, y: 39, pressure: .9 })
    expect(state.points).toEqual(released)
    state = moveStroke(state, { x: 90, y: 44, pressure: .5 })
    expect(state.points.at(-1)).toEqual({ x: end.x + 10, y: end.y + 5, pressure: .5 })
    state = setStrokeStraight(state, true)
    state = moveStroke(state, { x: 92, y: 90, pressure: .2 })
    expect(state.straightSegments).toHaveLength(2)
    expect(state.points.at(-1)!.x).toBeCloseTo(end.x + 10)
  })
  it('supports dots, reversal, modifier-only changes and forced final samples', () => {
    let state = beginStroke(origin, true)
    expect(state.straightSegments).toEqual([])
    state = moveStroke(state, { x: 70, y: 24, pressure: .8 })
    state = moveStroke(state, { x: -20, y: 19, pressure: .3 })
    expect(state.points.every((p) => p.y === origin.y)).toBe(true)
    expect(state.points.at(-1)!.x).toBeLessThan(origin.x)
    const free = moveStroke(beginStroke(origin, false), { ...origin, x: 10.1 }, false, true)
    expect(free.points).toHaveLength(2)
    expect(setStrokeStraight(setStrokeStraight(beginStroke(origin, false), true), false).points).toEqual([origin])
  })
  it.each(['pen', 'stabilized', 'brush'])('preserves %s constraints through codec, style, resize and history', (brush) => {
    const layer = pencil(brush)
    expect(layer.payload.strokeVersion).toBe(3)
    expect(parseSampledPayload(layer.payload, 'pencil', false)).toEqual(layer.payload)
    const document = withLayers([layer])
    expect(parseEditorDocument(serializeEditorDocument(document))).toMatchObject({ kind: 'editable', document })
    const styled = applyLayerStyle(layer, { brush: 'brush', smoothing: 1 })
    expect(styled.payload.strokeVersion).toBe(3)
    expect(styled.payload.straightSegments).toEqual(layer.payload.straightSegments)
    const resized = resizeLayerGeometry(styled, 'se', { x: 90, y: 90 }) as PencilLayer
    expect(resized.payload.straightSegments).toEqual(layer.payload.straightSegments)
    const geometry = resolveFreehandGeometry(resized.payload, true)
    const resizedPayload = resized.payload as PencilLayerPayload
    const range = resizedPayload.straightSegments![0]!
    const constrained = resizedPayload.points.slice(range.start, range.end + 1)
    const anchor = geometry.points.findIndex((p) => p.x === constrained[0]!.x && p.y === constrained[0]!.y)
    expect(anchor).toBeGreaterThanOrEqual(0)
    expect(geometry.points.slice(anchor, anchor + constrained.length)).toEqual(constrained)
    const manager = new CommandManager(withLayers([]))
    manager.execute({ type: 'addLayer', layer })
    expect(manager.undo().document.layers).toHaveLength(0)
    expect(manager.redo().document.layers).toEqual([layer])
  })
  it.each(['stabilized', 'brush'])('keeps %s straight axes at maximum smoothing', (brush) => {
    const state = moveStroke(beginStroke(origin, true), { x: 180, y: 25, pressure: .9 })
    const geometry = resolveFreehandGeometry({ ...DEFAULT_DRAWING_DEFAULTS.pencil, brush,
      strokeVersion: 3, smoothing: 1, pressureMode: 'pen', points: state.points,
      straightSegments: state.straightSegments }, true)
    expect(geometry.points.every((p) => p.y === origin.y)).toBe(true)
    expect(geometry.points[0]).toEqual(origin)
    expect(geometry.points.at(-1)).toEqual(state.points.at(-1))
    if (brush === 'brush') expect(geometry.outline.length).toBeGreaterThan(3)
  })
  it('rejects invalid straight ranges rather than silently losing constraints', () => {
    const layer = pencil('pen')
    for (const straightSegments of [[{ start: -1, end: 1 }], [{ start: 2, end: 1 }],
      [{ start: 0, end: 999 }], [{ start: .5, end: 1 }], [],
      [{ start: 0, end: 2 }, { start: 1, end: 3 }]]) {
      expect(() => parseSampledPayload({ ...layer.payload, straightSegments }, 'pencil', false)).toThrow('straightSegments')
    }
  })
})
