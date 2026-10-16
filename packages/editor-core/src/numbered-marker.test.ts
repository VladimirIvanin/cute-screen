import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createNumberedMarkerLayer,
  nextNumberedMarkerSequence,
} from './tools/content/marker'
import {
  numberedMarkerLabelBounds,
  rebaseNumberedMarkerLayer,
  setNumberedMarkerSequence,
  setNumberedMarkerCaption,
  numberedMarkerCaption,
  numberedMarkerNumberContent,
} from './numbered-marker'

const marker = (sequence = 1) => createNumberedMarkerLayer({ id: `marker-${sequence}`, sequence, origin: { x: 80, y: 96 } })

describe('numbered marker contracts', () => {
  it('continues after the maximum, including hidden, locked and duplicate numbers', () => {
    expect(nextNumberedMarkerSequence([])).toBe(1)
    expect(nextNumberedMarkerSequence([marker(1), { ...marker(3), visible: false, locked: true }, marker(3)])).toBe(4)
    expect(nextNumberedMarkerSequence([marker(3), marker(1)])).toBe(4)
  })
  it('rejects unsafe or nonpositive manual numbers', () => {
    for (const sequence of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => setNumberedMarkerSequence(marker(), sequence)).toThrow()
      expect(() => createNumberedMarkerLayer({ id: 'invalid', sequence, origin: { x: 0, y: 0 } })).toThrow()
    }
  })
  it('changes number and styled label together without changing identity or badge', () => {
    const before = marker()
    const after = setNumberedMarkerSequence(before, 100)
    expect(after.id).toBe(before.id)
    expect(after.payload).toMatchObject({ sequence: 100, label: { text: '100', spans: [{ start: 0, end: 3, fontSize: 16 }] }, badge: before.payload.badge })
    expect(before.payload.label.text).toBe('1')
  })
  it('keeps a separate multiline caption beside the stable number, including a numeric caption', () => {
    const before = marker(7)
    const caption = { ...before.payload.label, text: '7\nПродолжение',
      spans: [{ ...before.payload.label.spans[0]!, end: 13 }],
      paragraphs: [{ ...before.payload.label.paragraphs[0]!, end: 2 },
        { ...before.payload.label.paragraphs[0]!, start: 2, end: 13 }],
    }
    const after = setNumberedMarkerCaption(before, caption)
    expect(numberedMarkerCaption(after).text).toBe(caption.text)
    expect(numberedMarkerNumberContent(after).text).toBe('7')
    expect(after.payload.sequence).toBe(7)
    expect(after.localBounds).toEqual(before.localBounds)
    const renumbered = setNumberedMarkerSequence(after, 100)
    expect(numberedMarkerCaption(renumbered).text).toBe(caption.text)
    expect(numberedMarkerNumberContent(renumbered).text).toBe('100')
    expect(setNumberedMarkerCaption(after, { text: '', wrap: 'autoSize', spans: [], paragraphs: [] }).payload.label.text).toBe('7')
  })
  it.each(['circle', 'square', 'diamond', 'star'] as const)('fits measured text safely in %s and preserves the local centre under rotation', (shape) => {
    const before = { ...marker(100),
      transform: { ...marker().transform, rotation: 35 },
      payload: { ...marker(100).payload, badge: { ...marker().payload.badge, shape } },
    }
    const after = rebaseNumberedMarkerLayer(before, { width: 112, height: 72 })
    const b = after.localBounds
    const safe = numberedMarkerLabelBounds(after)
    expect(safe.width).toBeGreaterThanOrEqual(112)
    expect(safe.height).toBeGreaterThanOrEqual(72)
    expect(b.width).toBe(b.height)
    expect(b.x + b.width / 2).toBe(16)
    expect(b.y + b.height / 2).toBe(16)
    expect(after.transform).toEqual(before.transform)
  })
})
