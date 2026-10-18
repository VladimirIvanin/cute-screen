import {
  describe,
  expect,
  it,
} from 'vitest'
import { createCalloutLayer } from './tools/content/callout'
import {
  calloutPathPoints,
  calloutTextRect,
  updateCalloutHandle,
  addCalloutStep,
  removeCalloutStep,
} from './callout-geometry'
import {
  encodeClipboardLayersV2,
  decodeClipboardLayersV2,
} from './tools/content/clipboard-codec'
import {
  extractLayerStyle,
  applyLayerStyle,
} from './styles'
import {
  parseCalloutPayload,
  parseCalloutStyle,
} from './document/codec/callout'
import { DEFAULT_CALLOUT_STYLE } from './callout-geometry'

const id = '019c1f62-058e-7000-8000-000000000097'
const fixture = () => createCalloutLayer({ id, text: 'Заголовок\nПояснение', target: { x: 40, y: 50 },
  label: { x: 240, y: 150 } })!
const world = (layer: ReturnType<typeof fixture>,
  key: 'target' | 'label') => ({ x: layer.transform.translateX + layer.payload[key].x,
  y: layer.transform.translateY + layer.payload[key].y })
const orthogonal = (points: readonly { x: number; y: number }[]) => points.slice(1).every((p,
  i) => p.x === points[i]!.x || p.y === points[i]!.y)

describe('editable callouts', () => {
  it('chooses the same side for a diagonal gesture despite viewport rounding', () => {
    const layer = createCalloutLayer({ id, text: 'Diagonal', target: { x: 0, y: 0 }, label: { x: 200, y: 200.00000000001 } })!
    expect(layer.payload.attachment).toBe('auto')
    expect(layer.payload.route).toEqual({ path: 'corner', axis: 'y' })
  })
  it('preserves old v7 geometry and omitted fields through the production codec', () => {
    const legacy = createCalloutLayer({ id, text: 'Old label', target: { x: 20, y: 80 }, label: { x: 200, y: 140 }, style: null })!
    const decoded = decodeClipboardLayersV2(encodeClipboardLayersV2([legacy])).layers[0]!
    expect(decoded).toEqual(legacy)
    expect(decoded.payload).not.toHaveProperty('frame')
    expect(decoded.payload).not.toHaveProperty('attachment')
    expect(calloutPathPoints(legacy.payload)).toHaveLength(4)
  })
  it('restores an absent border and independent marker size/color from preferences', () => {
    const style = { ...DEFAULT_CALLOUT_STYLE, frame: { ...DEFAULT_CALLOUT_STYLE.frame, border: null },
      targetMarkerStyle: { size: 18, color: { red: 1, green: 0.5, blue: 0, alpha: 1 } } }
    expect(parseCalloutStyle(JSON.parse(JSON.stringify(style)))).toEqual(style)
    expect(parseCalloutStyle(null)).toBeNull()
    expect(() => parseCalloutStyle({ ...style, points: [] })).toThrow()
  })
  it('rejects diagonal manual segments and invalid marker geometry', () => {
    const payload = fixture().payload
    expect(() => parseCalloutPayload({ ...payload, route: { path: 'orthogonal', preset: 'corner', axis: 'x', points: [{ x: 99, y: 101 }] } }, 'callout')).toThrow('orthogonal')
    expect(() => parseCalloutPayload({ ...payload, targetMarkerStyle: { size: 0 } }, 'callout')).toThrow()
    expect(() => parseCalloutPayload({ ...payload, targetMarkerStyle: { size: Infinity } }, 'callout')).toThrow()
  })
  it('creates a corner route and an attached card without a label dot', () => {
    const layer = fixture()
    expect(layer.payload).toMatchObject({ route: { path: 'corner' }, targetMarker: 'circle',
      labelMarker: 'none', frame: { kind: 'card', padding: 8, radius: 8 }, attachment: 'auto' })
    expect(calloutPathPoints(layer.payload)).toHaveLength(3)
    expect(calloutTextRect(layer.payload).x).toBe(layer.payload.label.x)
  })
  it('moves the label across its target without flipping the attachment or moving the target', () => {
    const initial = fixture()
    const layer = { ...initial, payload: { ...initial.payload, attachment: 'left' as const } }
    const after = updateCalloutHandle(layer, 'label', { x: layer.payload.target.x - 300, y: layer.payload.label.y })
    expect(after.payload.attachment).toBe('left')
    expect(world(after, 'target')).toEqual(world(layer, 'target'))
    expect(calloutTextRect(after.payload).x).toBe(after.payload.label.x)
  })
  it('keeps the terminal line outside a plain label after crossing the target', () => {
    const layer = fixture()
    const plain = { ...layer, payload: { ...layer.payload, attachment: 'left' as const, frame: { ...layer.payload.frame!, kind: 'text' as const } } }
    const after = updateCalloutHandle(plain, 'label', { x: plain.payload.target.x - 100, y: plain.payload.label.y })
    const points = calloutPathPoints(after.payload)
    expect(points.at(-2)!.x).toBeLessThanOrEqual(after.payload.label.x)
    expect(after.payload.attachment).toBe('left')
    expect(orthogonal(points)).toBe(true)
  })
  it('inserts a draggable step, keeps endpoints and removes the step', () => {
    const layer = fixture()
    const stepped = addCalloutStep(layer, 0, 40)
    expect(calloutPathPoints(stepped.payload)).toHaveLength(5)
    expect(orthogonal(calloutPathPoints(stepped.payload))).toBe(true)
    expect(world(stepped, 'target')).toEqual(world(layer, 'target'))
    expect(world(stepped, 'label')).toEqual(world(layer, 'label'))
    const moved = updateCalloutHandle(stepped, 'segment:1', { x: 130, y: 70 })
    expect(orthogonal(calloutPathPoints(moved.payload))).toBe(true)
    const removed = removeCalloutStep(stepped)
    expect(calloutPathPoints(removed.payload)).toHaveLength(3)
  })
  it('removes collapsed endpoint segments and keeps a collapsed manual route editable', () => {
    const layer = fixture()
    const manual = { ...layer, payload: { ...layer.payload,
      route: { path: 'orthogonal' as const, preset: 'corner' as const, axis: 'y' as const,
        points: [{ x: layer.payload.target.x, y: layer.payload.label.y }] } } }
    const collapsed = updateCalloutHandle(manual, 'target', { x: layer.payload.target.x, y: layer.payload.label.y })
    expect(calloutPathPoints(collapsed.payload)).toHaveLength(2)
    const moved = updateCalloutHandle(collapsed, 'target', { x: collapsed.payload.target.x + 20,
      y: collapsed.payload.target.y - 30 })
    expect(orthogonal(calloutPathPoints(moved.payload))).toBe(true)
    expect(world(moved, 'label')).toEqual(world(layer, 'label'))
  })
  it('round-trips route, frame and independent markers through the production clipboard codec', () => {
    const layer = fixture()
    const styled = { ...layer, payload: { ...layer.payload, targetMarker: 'ring' as const,
      targetMarkerStyle: { size: 14, color: { red: 1, green: 0, blue: 0, alpha: 1 } } } }
    expect(decodeClipboardLayersV2(encodeClipboardLayersV2([styled])).layers[0]).toEqual(styled)
  })
  it('copies appearance and route preset without copying manual coordinates', () => {
    const source = addCalloutStep(fixture(), 0, 60)
    const style = extractLayerStyle(source)
    expect(JSON.stringify(style)).not.toContain('points')
    const target = fixture()
    const after = applyLayerStyle(target, style)
    expect(after.kind).toBe('callout')
    expect(after.payload.content).toEqual(target.payload.content)
  })
  it('copies a legacy plain label onto a new card without copying its geometry', () => {
    const legacy = createCalloutLayer({ id, text: 'Old', target: { x: 20, y: 50 }, label: { x: 80, y: 100 }, style: null })!
    const target = fixture()
    const after = applyLayerStyle(target, extractLayerStyle(legacy))
    expect(after.payload.frame?.kind).toBe('text')
    expect(world(after, 'target')).toEqual(world(target, 'target'))
    expect(world(after, 'label')).toEqual(world(target, 'label'))
    expect(after.payload.content.text).toBe(target.payload.content.text)
  })
})
