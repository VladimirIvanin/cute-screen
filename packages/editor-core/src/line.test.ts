import {
  encodeClipboardLayersV2,
  decodeClipboardLayersV2,
} from './tools/content/clipboard-codec'
import { createDuplicateLayerCommand } from './tools/content/commands'
import {
  parseEditorDocument,
  serializeEditorDocument,
} from './document/codec'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createDrawingLayer,
  DEFAULT_DRAWING_DEFAULTS,
} from './drawing'
import {
  resolveLineEndpoint,
  annotationTool,
} from './line'
import {
  creationPolicy,
  applyLayerStyle,
  extractLayerStyle,
} from './styles'
import { parseArrowPayload } from './document/codec/paint'
import { parseDrawingToolPreferences } from './drawing-preferences'
import { CommandManager } from './commands/manager'
import { withLayers } from './precision-tools.test-kit'
import type { ArrowLayer } from './document/types'

const start = { x: 20, y: 40 }
const at = (degrees: number) => ({ x: start.x + Math.cos(degrees * Math.PI / 180) * 200,
  y: start.y + Math.sin(degrees * Math.PI / 180) * 200 })
const line = () => createDrawingLayer({ id: '019c1f62-058e-7000-8000-000000000010',
  tool: 'line', start, end: { x: 220, y: 40 } }) as ArrowLayer

describe('line annotation', () => {
  it('snaps near each axis with 5/8 degree hysteresis', () => {
    for (const angle of [0, 90, 180, 270]) {
      const first = resolveLineEndpoint(start, at(angle + 4.9))
      expect(first.axis).toBe(angle % 180 === 0 ? 'horizontal' : 'vertical')
      expect(resolveLineEndpoint(start, at(angle + 7.9), { axis: first.axis }).axis).toBe(first.axis)
      expect(resolveLineEndpoint(start, at(angle + 8.1), { axis: first.axis }).axis).toBeUndefined()
      expect(resolveLineEndpoint(start, at(angle + 5.1)).axis).toBeUndefined()
    }
  })
  it('projects onto the axis and allows free angles or Shift precedence', () => {
    expect(resolveLineEndpoint(start, { x: 220, y: 43 }).point).toEqual({ x: 220, y: 40 })
    expect(resolveLineEndpoint(start, at(3), { enabled: false }).point).toEqual(at(3))
    const result = resolveLineEndpoint(start, at(40), { shift: true, axis: 'horizontal' })
    expect(result.point.x - start.x).toBeCloseTo(result.point.y - start.y)
    expect(result.axis).toBeUndefined()
    expect(resolveLineEndpoint(start, start).point).toEqual(start)
  })
  it('creates a distinct repeated straight annotation with independent defaults', () => {
    const layer = line()
    expect(layer.payload).toMatchObject({ annotationTool: 'line', path: 'straight', startCap: 'none', endCap: 'none' })
    expect(annotationTool(layer)).toBe('line')
    expect(creationPolicy(annotationTool(layer))).toBe('repeat')
    expect(DEFAULT_DRAWING_DEFAULTS.line.stroke).not.toBe(DEFAULT_DRAWING_DEFAULTS.arrow.stroke)
    const old = { ...layer, payload: { ...layer.payload, annotationTool: undefined } } as unknown as ArrowLayer
    expect(annotationTool(old)).toBe('arrow')
  })
  it('supports centered construction and does not create zero length lines', () => {
    const layer = createDrawingLayer({ id: line().id, tool: 'line', start, end: { x: 220, y: 40 }, drawFromCenter: true }) as ArrowLayer
    expect(layer.transform.translateX + layer.payload.start.x).toBe(-180)
    expect(layer.transform.translateX + layer.payload.end.x).toBe(220)
    expect(createDrawingLayer({ id: layer.id, tool: 'line', start, end: start })).toBeUndefined()
  })
  it('round trips the semantic discriminator and rejects invalid line geometry', () => {
    const payload = line().payload
    expect(parseArrowPayload(JSON.parse(JSON.stringify(payload)), 'line')).toEqual(payload)
    expect(() => parseArrowPayload({ ...payload, endCap: 'triangle' }, 'line')).toThrow()
    expect(() => parseArrowPayload({ ...payload, path: 'quadratic', bend: start }, 'line')).toThrow()
    expect(() => parseArrowPayload({ ...payload, annotationTool: 'invalid' }, 'line')).toThrow()
  })
  it('transfers only compatible styles and preserves identity through undo/redo', () => {
    const layer = line()
    const next = applyLayerStyle(layer, { endCap: 'triangle', startCap: 'circle', width: 8, strokeStyle: 'dotted' })
    expect(next.payload).toMatchObject({ annotationTool: 'line', path: 'straight', startCap: 'none', endCap: 'none', stroke: { width: 8, style: 'dotted' } })
    expect(extractLayerStyle(next)).not.toHaveProperty('endCap')
    expect(extractLayerStyle(next)).not.toHaveProperty('annotationTool')
    const manager = new CommandManager(withLayers([]))
    manager.execute({ type: 'addLayer', layer })
    expect(manager.undo().document.layers).toHaveLength(0)
    expect(manager.redo().document.layers[0]).toEqual(layer)
    expect(manager.undo().document.layers).toHaveLength(0)
  })
  it('restores line defaults and supplies defaults for older preferences', () => {
    const saved = parseDrawingToolPreferences({
      schemaVersion: 2,
      defaults: {
        ...DEFAULT_DRAWING_DEFAULTS,
        line: {
          ...DEFAULT_DRAWING_DEFAULTS.line,
          stroke: { ...(DEFAULT_DRAWING_DEFAULTS.line.stroke as object), width: 7 },
        },
      },
    })
    expect(saved.defaults.line.stroke).toMatchObject({ width: 7 })
    expect(
      parseDrawingToolPreferences({ schemaVersion: 2, defaults: {} }).defaults.line,
    ).toEqual(DEFAULT_DRAWING_DEFAULTS.line)
  })
})

it('retains line identity through full document codecs, clipboard and duplication', () => {
  const layer = line()
  const parsed = parseEditorDocument(serializeEditorDocument(withLayers([layer])))
  expect(parsed.kind).toBe('editable')
  if (parsed.kind === 'editable') expect(parsed.document.layers[0]).toEqual(layer)
  expect(decodeClipboardLayersV2(encodeClipboardLayersV2([layer])).layers[0]).toEqual(layer)
  const command = createDuplicateLayerCommand(layer, { id: '019c1f62-058e-7000-8000-000000000011', zoom: 1, cascadeIndex: 1 })
  const manager = new CommandManager(withLayers([layer]))
  const duplicate = manager.execute(command).document.layers[1]!
  expect(annotationTool(duplicate)).toBe('line')
  expect(duplicate.id).not.toBe(layer.id)
})
