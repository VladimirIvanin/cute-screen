import {
  describe,
  expect,
  it,
} from 'vitest'
import { createCalloutLayer } from './tools/content/callout'
import {
  calloutGeometryBounds,
  calloutLabelContains,
  calloutPathPoints,
  calloutSelectionHandles,
  calloutTextRect,
  rebaseCalloutLayer,
  updateCalloutHandle,
  removeCalloutStepAt,
  calloutAccentSide,
} from './callout-geometry'
import { calloutNodes } from './document/scene/text'
import { parseCalloutPayload } from './document/codec/callout'
import {
  extractLayerStyle,
  applyLayerStyle,
} from './styles'

const seed = (text = 'Подпись') => createCalloutLayer({ id: 'revision', text,
  target: { x: 20, y: 30 }, label: { x: 280, y: 180 } })!
const world = (layer: ReturnType<typeof seed>, p: { x: number; y: number }) => ({
  x: layer.transform.translateX + p.x, y: layer.transform.translateY + p.y,
})

describe('callout revision contracts', () => {
  it('uses measured label geometry for the accent when a fixed-side detour reverses the target tangent', () => {
    const payload = { ...seed().payload, target: { x: 500, y: 100 }, label: { x: 200, y: 200 },
      attachment: 'left' as const, route: { path: 'corner' as const, axis: 'y' as const } }
    expect(calloutAccentSide(payload, { measureText: () => ({ width: 100, height: 300 }) })).toBe('top')
  })
  it('creates canonical empty rich text and excludes hidden label decoration from bounds and handles', () => {
    const layer = seed('')
    expect(layer).not.toBeNull()
    expect(layer.payload.content).toMatchObject({ text: '', spans: [], paragraphs: [] })
    expect(layer.payload.frame?.kind).toBe('card')
    expect(calloutTextRect(layer.payload)).toMatchObject({ width: 0, height: 0 })
    expect(calloutLabelContains(layer.payload, layer.payload.label)).toBe(false)
    expect(calloutSelectionHandles(layer).some((handle) => handle.kind === 'width')).toBe(false)
    expect(calloutNodes(layer).map((node) => node.id)).toEqual(['revision:connector', 'revision:target-marker'])
    const huge = { ...layer.payload, frame: { ...layer.payload.frame!, padding: 256 } }
    expect(calloutGeometryBounds(huge)).toEqual(calloutGeometryBounds(layer.payload))
  })

  it('places auto labels horizontally and flips only auto after crossing the target', () => {
    const layer = seed()
    expect(layer.payload.attachment).toBe('auto')
    expect(calloutTextRect(layer.payload).x).toBe(layer.payload.label.x)
    const moved = updateCalloutHandle(layer, 'label', { x: layer.payload.target.x - 100, y: 1000 })
    const rect = calloutTextRect(moved.payload)
    expect(rect.x + rect.width).toBe(moved.payload.label.x)
    expect(world(moved, moved.payload.target)).toEqual(world(layer, layer.payload.target))
    const fixed = { ...layer, payload: { ...layer.payload, attachment: 'left' as const } }
    const fixedMoved = updateCalloutHandle(fixed, 'label', { x: -100, y: 1000 })
    expect(fixedMoved.payload.attachment).toBe('left')
  })

  it('bends a straight route, preserves world endpoints and round-trips the control point', () => {
    const layer = seed()
    const line = rebaseCalloutLayer(layer, { ...layer.payload, route: { path: 'straight' } })
    expect(calloutSelectionHandles(line).some((handle) => handle.kind === 'bend')).toBe(true)
    const curved = updateCalloutHandle(line, 'bend', { x: 150, y: -80 })
    expect(curved.payload.route.path).toBe('quadratic')
    expect(calloutPathPoints(curved.payload).length).toBeGreaterThan(4)
    expect(world(curved, curved.payload.target)).toEqual(world(line, line.payload.target))
    expect(world(curved, curved.payload.label)).toEqual(world(line, line.payload.label))
    expect(parseCalloutPayload(JSON.parse(JSON.stringify(curved.payload)), 'callout')).toEqual(curved.payload)
    const style = extractLayerStyle(curved)
    expect(style.calloutRoute).toBe('straight')
    expect(JSON.stringify(style)).not.toContain('bend')
    expect(applyLayerStyle(seed(), style).payload.route).toEqual({ path: 'straight' })
  })

  it.each([
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, 'right'],
    [{ x: 100, y: 0 }, { x: 0, y: 0 }, 'left'],
    [{ x: 0, y: 0 }, { x: 0, y: 100 }, 'bottom'],
    [{ x: 0, y: 100 }, { x: 0, y: 0 }, 'top'],
  ] as const)('orients accent opposite the target tangent (%j → %j)', (target, label, side) => {
    expect(calloutAccentSide({ ...seed().payload, target, label, route: { path: 'straight' } })).toBe(side)
  })

  it.each([1, 3, 5])('removes the indexed step at segment %i while preserving unrelated geometry and endpoints', (segment) => {
    const layer = seed()
    const points = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 },
      { x: 80, y: 40 }, { x: 80, y: 80 }, { x: 120, y: 80 },
      { x: 120, y: 120 }, { x: 160, y: 120 }, { x: 160, y: 160 }]
    const manual = rebaseCalloutLayer(layer, { ...layer.payload, attachment: 'left',
      target: points[0]!, label: points.at(-1)!, route: { path: 'orthogonal', preset: 'corner', axis: 'y', points: points.slice(1, -1) } })
    const before = calloutPathPoints(manual.payload)
    const removed = removeCalloutStepAt(manual, segment)
    const after = calloutPathPoints(removed.payload)
    expect(after.length).toBe(before.length - 2)
    expect(after.slice(1).every((p, i) => p.x === after[i]!.x || p.y === after[i]!.y)).toBe(true)
    expect(world(removed, removed.payload.target)).toEqual(world(manual, manual.payload.target))
    expect(world(removed, removed.payload.label)).toEqual(world(manual, manual.payload.label))
    expect(after.slice(0, Math.max(1, segment - 1)).map((p) => world(removed, p)))
      .toEqual(before.slice(0, Math.max(1, segment - 1)).map((p) => world(manual, p)))
    expect(after.slice(segment + 1).map((p) => world(removed, p)))
      .toEqual(before.slice(segment + 3).map((p) => world(manual, p)))
  })

  it('does not delete endpoints, invalid indices or the minimum route', () => {
    const layer = seed()
    for (const segment of [-1, 0, 1, 99, NaN]) expect(removeCalloutStepAt(layer, segment)).toBe(layer)
  })
})
