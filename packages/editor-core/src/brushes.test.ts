import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  resolveFreehandGeometry,
  freehandOutlineContains,
  changePencilBrush,
} from './tools/freehand'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import { freehandNodes } from './document/scene/drawing'
import { parseSampledPayload } from './document/codec/paint'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import {
  applyLayerStyle,
  styleCommand,
} from './styles'
import { parseDrawingToolPreferences } from './drawing-preferences'
import type {
  PencilLayer,
  JsonObject,
} from './document/types'
import { withLayers } from './precision-tools.test-kit'
import { CommandManager } from './commands/manager'
import {
  encodeClipboardLayersV2,
  decodeClipboardLayersV2,
} from './tools/content/clipboard-codec'
import { hitTestDocument } from './hit-test'
import { resizeLayerGeometry } from './layer-resize'

const points = Array.from({ length: 160 }, (_, i) => ({
  x: 20 + i * 2, y: 60 + (i % 2 ? 4 : -4), pressure: i % 2 ? .9 : .2,
}))
const payload = (brush: string): JsonObject => ({
  ...DEFAULT_DRAWING_DEFAULTS.pencil, brush, width: 8, smoothing: .65,
  strokeVersion: 2, pressureMode: 'pen', points,
})
const layer = (brush: string) => createDrawingLayer({
  id: '019c1f62-058e-7000-8000-000000000019', tool: 'pencil',
  start: points[0]!, end: points.at(-1)!, points,
  defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: payload(brush) },
}) as PencilLayer

const rms = (samples: readonly { y: number }[]) => Math.sqrt(
  samples.reduce((sum, point) => sum + (point.y - 60) ** 2, 0) / samples.length,
)

describe('distinct ink brushes', () => {
  it('defaults to autocorrection and preserves exact pen trajectory and nominal width', () => {
    expect(DEFAULT_DRAWING_DEFAULTS.pencil.brush).toBe('stabilized')
    const geometry = resolveFreehandGeometry(payload('pen'), true)
    expect(geometry.points).toEqual(points)
    expect(geometry.width).toBe(8)
    expect(freehandNodes(layer('pen'))[0]).toMatchObject({ kind: 'path', strokeWidth: 8 })
  })
  it('removes at least half the RMS jitter at 65% and preserves endpoints and input', () => {
    const input = payload('stabilized')
    const before = structuredClone(input)
    const geometry = resolveFreehandGeometry(input, true)
    expect(rms(geometry.points.slice(5, -5))).toBeLessThanOrEqual(rms(points.slice(5, -5)) * .5)
    expect(geometry.points[0]).toMatchObject(points[0]!)
    expect(geometry.points.at(-1)).toMatchObject(points.at(-1)!)
    expect(input).toEqual(before)
    expect(resolveFreehandGeometry({ ...input, smoothing: 0 }, true).points).toEqual(points)
  })
  it('renders each new stroke in one node, including 12000 points', () => {
    for (const brush of ['pen', 'stabilized', 'brush']) {
      const stroke = layer(brush)
      expect(freehandNodes(stroke)).toHaveLength(1)
      const long = { ...stroke, payload: { ...stroke.payload, points: Array.from({ length: 12000 }, (_, i) => ({
        x: i, y: Math.sin(i / 50) * 20, pressure: .5,
      })) } }
      expect(freehandNodes(long)).toHaveLength(1)
    }
  })
  it('uses real pressure and simulated pressure for different outlines', () => {
    const input = payload('brush')
    const low = resolveFreehandGeometry({ ...input, points: points.map((p) => ({ ...p, pressure: .1 })) }, true)
    const high = resolveFreehandGeometry({ ...input, points: points.map((p) => ({ ...p, pressure: 1 })) }, true)
    const extent = (outline: typeof low.outline) => Math.max(...outline.map((p) => p.y))
      - Math.min(...outline.map((p) => p.y))
    expect(extent(high.outline)).toBeGreaterThan(extent(low.outline))
    expect(resolveFreehandGeometry({ ...input, pressureMode: 'simulated' }, true).outline).not.toEqual(high.outline)
    expect(freehandNodes(layer('brush'))[0]!.kind).toBe('polygon')
  })
  it.each(['pen', 'stabilized', 'brush'])('keeps %s dots, short paths, arcs, corners and loop holes usable', (brush) => {
    const input = payload(brush)
    for (const samples of [points.slice(0, 1), points.slice(0, 2)]) {
      const geometry = resolveFreehandGeometry({ ...input, points: samples }, true)
      expect(geometry.points.length).toBeGreaterThan(0)
      expect([...geometry.points, ...geometry.outline].every((p) => Number.isFinite(p.x + p.y))).toBe(true)
    }
    const loop = Array.from({ length: 161 }, (_, i) => ({
      x: 100 + Math.cos(i / 160 * Math.PI * 2) * 40,
      y: 100 + Math.sin(i / 160 * Math.PI * 2) * 40, pressure: .7,
    }))
    const stroke = createDrawingLayer({ id: layer(brush).id, tool: 'pencil',
      start: loop[0]!, end: loop.at(-1)!, points: loop,
      defaults: { ...DEFAULT_DRAWING_DEFAULTS, pencil: input },
    }) as PencilLayer
    expect(hitTestDocument(withLayers([stroke]), { x: 100, y: 100 })).toBeUndefined()
    expect(hitTestDocument(withLayers([stroke]), loop[0]!)).toMatchObject({ nodeId: stroke.id })
    if (brush === 'brush') {
      const geometry = resolveFreehandGeometry(stroke.payload, true)
      expect(freehandOutlineContains(geometry.outline, { x: 100 - stroke.transform.translateX,
        y: 100 - stroke.transform.translateY })).toBe(false)
    }
    const corner = [{ x: 0, y: 0, pressure: .5 }, { x: 20, y: 0, pressure: .5 },
      { x: 20, y: 20, pressure: .5 }]
    expect(resolveFreehandGeometry({ ...input, points: corner }, true).points.at(-1)).toMatchObject(corner.at(-1)!)
  })
  it('round-trips new payload and rejects unknown versions or pressure modes', () => {
    const stroke = layer('stabilized')
    expect(parseSampledPayload(stroke.payload, 'pencil', false)).toEqual(stroke.payload)
    expect(() => parseSampledPayload({ ...stroke.payload, strokeVersion: 3 }, 'pencil', false)).toThrow('strokeVersion')
    expect(() => parseSampledPayload({ ...stroke.payload, pressureMode: 'bad' }, 'pencil', false)).toThrow('pressureMode')
    const document = withLayers([stroke])
    expect(parseEditorDocument(serializeEditorDocument(document))).toMatchObject({ kind: 'editable', document })
    expect(decodeClipboardLayersV2(encodeClipboardLayersV2([stroke])).layers).toEqual([stroke])
  })
  it('upgrades legacy geometry in one undoable command and keeps source pressure mode', () => {
    const old = { ...layer('pen'), payload: { ...layer('pen').payload, brush: 'pencil' } }
    delete (old.payload as Record<string, unknown>).strokeVersion
    delete (old.payload as Record<string, unknown>).pressureMode
    expect(freehandNodes(old as PencilLayer)).toHaveLength(points.length - 1)
    const before = withLayers([old as PencilLayer])
    const manager = new CommandManager(before)
    const command = styleCommand(before.layers, { brush: 'stabilized' })!
    const after = manager.execute(command).document
    expect(after.layers[0]).toMatchObject({ payload: { strokeVersion: 2 } })
    expect(manager.undo().document).toEqual(before)
    expect(manager.redo().document).toEqual(after)
    expect(applyLayerStyle(layer('pen'), { brush: 'brush' }).payload.pressureMode).toBe('pen')
  })
  it('bounds contain the actual outline after resize and rotation/reflection hit testing', () => {
    const stroke = layer('brush')
    const resized = resizeLayerGeometry(stroke, 'se', { x: 90, y: 100 }) as PencilLayer
    const geometry = resolveFreehandGeometry(resized.payload, true)
    const b = resized.localBounds
    expect(geometry.outline.every((p) => p.x >= b.x && p.y >= b.y
      && p.x <= b.x + b.width && p.y <= b.y + b.height)).toBe(true)
    const transform = { ...stroke.transform, rotation: 90, scaleX: -1, translateX: 400, translateY: 400 }
    const local = resolveFreehandGeometry(stroke.payload, true).points[10]!
    const point = { x: 400 - local.y, y: 400 - local.x }
    expect(hitTestDocument(withLayers([{ ...stroke, transform }]), point)?.nodeId).toBe(stroke.id)
    expect(resized.payload.width).toBe(stroke.payload.width)
  })
  it('migrates preferences, retains appearance and remembers correction separately', () => {
    const preferences = parseDrawingToolPreferences({ schemaVersion: 2, defaults: { pencil: {
      brush: 'pencil', width: 7, smoothing: .4, layerOpacity: .6,
    } } })
    expect(preferences.defaults.pencil).toMatchObject({ brush: 'pen', width: 7, layerOpacity: .6, strokeVersion: 2 })
    let value = changePencilBrush({ ...DEFAULT_DRAWING_DEFAULTS.pencil, smoothing: .8 }, 'brush')
    expect(value.smoothing).toBe(.35)
    value = changePencilBrush({ ...value, smoothing: .2 }, 'stabilized')
    expect(value.smoothing).toBe(.8)
    expect(changePencilBrush(value, 'brush').smoothing).toBe(.2)
    const reopened = parseDrawingToolPreferences({
      ...preferences, defaults: { ...preferences.defaults, pencil: value },
    })
    expect(changePencilBrush(reopened.defaults.pencil, 'brush').smoothing).toBe(.2)
  })
})
