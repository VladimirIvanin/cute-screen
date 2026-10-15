import type { ArrowLayer } from './document/types'
import {
  describe,
  expect,
  it,
} from 'vitest'
import { createDrawingLayer } from './drawing'
import { createTextLayer } from './tools/content/text'
import {
  applyLayerStyle,
  extractLayerStyle,
  commonLayerStyle,
  styleCommand,
  creationPolicy,
} from './styles'

const arrow = () =>
  createDrawingLayer({
    id: '019c1f62-058e-7000-8000-000000000010',
    tool: 'arrow',
    start: { x: 20, y: 20 },
    end: { x: 100, y: 80 },
  }) as ArrowLayer
describe('tool UX style contract', () => {
  it('uses explicit repeated versus one-shot creation policies', () => {
    for (const kind of ['numberedMarker', 'pencil', 'marker']) expect(creationPolicy(kind)).toBe('repeat')
    for (const kind of ['arrow', 'shape', 'text', 'callout', 'censor', 'spotlight', 'ruler', 'loupe', 'image'])
      expect(creationPolicy(kind)).toBe('select')
  })
  it('copies visual fields without copying endpoints, identity or transforms', () => {
    const source = arrow()
    const target = {
      ...arrow(),
      id: '019c1f62-058e-7000-8000-000000000011',
      transform: { ...source.transform, translateX: 300 },
    }
    const next = applyLayerStyle(target, extractLayerStyle(source))
    expect(next.id).toBe(target.id)
    expect(next.transform).toEqual(target.transform)
    expect(next.payload.start).toEqual(target.payload.start)
    expect(extractLayerStyle(source)).not.toHaveProperty('start')
  })
  it('exposes mixed values and disables an entire locked batch', () => {
    const first = arrow()
    const second = applyLayerStyle({ ...arrow(), id: '019c1f62-058e-7000-8000-000000000011' }, { width: 8 })
    expect(commonLayerStyle([first, second]).width).toBeNull()
    expect(styleCommand([first, { ...second, locked: true }], { width: 5 })).toBeNull()
    expect(styleCommand([first, second], { width: 5 })?.type).toBe('batch')
    expect(first.payload.stroke.width).not.toBe(5)
  })
  it('retains mixed text and UTF-16 ranges when transferring only uniform properties', () => {
    const text = createTextLayer({
      id: '019c1f62-058e-7000-8000-000000000012',
      text: 'A😀B',
      origin: { x: 10, y: 10 },
    })!
    const mixed = {
      ...text,
      payload: {
        ...text.payload,
        content: {
          ...text.payload.content,
          spans: [
            {
              ...text.payload.content.spans[0]!,
              start: 0,
              end: 1,
              fontSize: 12,
            },
            {
              ...text.payload.content.spans[0]!,
              start: 1,
              end: 4,
              fontSize: 24,
            },
          ],
        },
      },
    }
    const style = extractLayerStyle(mixed)
    expect(style).not.toHaveProperty('fontSize')
    const next = applyLayerStyle(mixed, { italic: true })
    expect(next.payload.content.text).toBe('A😀B')
    expect(next.payload.content.spans.map((span) => [span.start, span.end, span.fontSize])).toEqual([
      [0, 1, 12],
      [1, 4, 24],
    ])
    expect(next.payload.content.spans.every((span) => span.italic)).toBe(true)
  })
})
