import { fireEvent } from '@testing-library/vue'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { RulerLayer } from '@cute-screen/editor-core'
import {
  canvasContext,
  contextFixture,
  precisionDefaults,
  documentFixture,
  mountViewport,
  mountViewportDocument,
  precisionLayerFixture,
  transformedPoint,
} from './m08-precision-test-kit'

beforeEach(() => {
  contextFixture.current = canvasContext()
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(contextFixture.current)
})
afterEach(() => vi.restoreAllMocks())

function addedRuler(events: Record<string, unknown>): RulerLayer {
  return (events.addLayer as unknown[][])[0]![0] as RulerLayer
}

function delta(layer: RulerLayer) {
  const start = transformedPoint(layer.transform, layer.payload.start)
  const end = transformedPoint(layer.transform, layer.payload.end)
  return { x: end.x - start.x, y: end.y - start.y }
}

describe('Shift ruler input', () => {
  it.each([0, 45, 90, 135, 180, -135, -90, -45])('snaps to %s degrees', async (angle) => {
    const { scene, emitted } = mountViewport('ruler')
    const radians = (angle + 6) * Math.PI / 180
    await fireEvent.pointerDown(scene, { clientX: 60, clientY: 40, shiftKey: true })
    await fireEvent.pointerUp(scene, { clientX: 60 + Math.cos(radians) * 20,
      clientY: 40 + Math.sin(radians) * 20, shiftKey: true })
    const vector = delta(addedRuler(emitted()))
    expect(Math.abs(vector.x - Math.cos(angle * Math.PI / 180) * 20)).toBeLessThan(1e-8)
    expect(Math.abs(vector.y - Math.sin(angle * Math.PI / 180) * 20)).toBeLessThan(1e-8)
  })

  it('restores configured Alt after releasing the last Shift and updates preview immediately', async () => {
    const defaults = { ...precisionDefaults, ruler: { ...precisionDefaults.ruler, snapAngleIncrementDegrees: 20 } }
    const { scene, emitted } = mountViewportDocument('ruler', documentFixture(), defaults)
    await fireEvent.pointerDown(scene, { clientX: 20, clientY: 20 })
    await fireEvent.pointerMove(scene, { clientX: 65, clientY: 50 })
    await fireEvent.keyDown(window, { key: 'Shift', shiftKey: true, altKey: true })
    await fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftLeft', shiftKey: true, altKey: true })
    const length = Math.hypot(45, 30)
    expect(contextFixture.current.lineTo).toHaveBeenCalledWith(
      expect.closeTo(20 + length / Math.SQRT2, 8),
      expect.closeTo(20 + length / Math.SQRT2, 8),
    )
    vi.mocked(contextFixture.current.lineTo).mockClear()
    await fireEvent.keyUp(window, { key: 'Shift', code: 'ShiftRight', shiftKey: false, altKey: true })
    expect(contextFixture.current.lineTo).toHaveBeenCalledWith(
      expect.closeTo(20 + length * Math.cos(40 * Math.PI / 180), 8),
      expect.closeTo(20 + length * Math.sin(40 * Math.PI / 180), 8))
    await fireEvent.pointerUp(scene, { clientX: 65, clientY: 50, altKey: true })
    const vector = delta(addedRuler(emitted()))
    expect(Math.atan2(vector.y, vector.x) * 180 / Math.PI).toBeCloseTo(40)
  })

  it.each(['Escape', 'blur', 'pointercancel'])('cancels a constrained ruler on %s', async (cancel) => {
    const close = vi.fn()
    const outer = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) close()
    }
    window.addEventListener('keydown', outer)
    try {
      const { scene, emitted } = mountViewport('ruler')
      await fireEvent.pointerDown(scene, { clientX: 20, clientY: 20, shiftKey: true })
      await fireEvent.pointerMove(scene, { clientX: 65, clientY: 50, shiftKey: true })
      if (cancel === 'Escape') await fireEvent.keyDown(window, { key: 'Escape' })
      else if (cancel === 'blur') await fireEvent(window, new Event('blur'))
      else await fireEvent.pointerCancel(scene)
      await fireEvent.pointerUp(scene, { clientX: 65, clientY: 50, shiftKey: true })
      expect(emitted().addLayer).toBeUndefined()
      expect(close).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', outer)
    }
  })

  it('keeps a constrained ray inside the crop and ignores zero-length creation', async () => {
    const { scene, emitted } = mountViewport('ruler', { x: 0, y: 0, width: 100, height: 60 })
    await fireEvent.pointerDown(scene, { clientX: 20, clientY: 20, shiftKey: true })
    await fireEvent.pointerUp(scene, { clientX: 20, clientY: 20, shiftKey: true })
    expect(emitted().addLayer).toBeUndefined()
    await fireEvent.pointerDown(scene, { clientX: 20, clientY: 20, shiftKey: true })
    await fireEvent.pointerUp(scene, { clientX: 200, clientY: 180, shiftKey: true })
    const ruler = addedRuler(emitted())
    const end = transformedPoint(ruler.transform, ruler.payload.end)
    expect(end.y).toBeCloseTo(60)
    expect(delta(ruler).x).toBeCloseTo(delta(ruler).y)
  })

  it.each([false, true])('snaps creation to 45° with final pointerup (move=%s)', async (move) => {
    const { scene, emitted } = mountViewport('ruler')
    await fireEvent.pointerDown(scene, { clientX: 20, clientY: 20, shiftKey: true })
    if (move) await fireEvent.pointerMove(scene, { clientX: 45, clientY: 37, shiftKey: true })
    await fireEvent.pointerUp(scene, { clientX: 65, clientY: 50, shiftKey: true })
    expect(emitted().addLayer).toHaveLength(1)
    const ruler = addedRuler(emitted())
    const vector = delta(ruler)
    expect(vector.x).toBeCloseTo(vector.y)
    expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(Math.hypot(45, 30))
    expect(ruler.payload.snapAngleIncrementDegrees).toBe(15)
  })

  it.each([
    ['Shift', true, false, 45],
    ['Alt', false, true, 30],
    ['Shift', true, true, 45],
  ] as const)('recomputes %s from raw coordinates without mouse movement', async (key, shiftKey, altKey, angle) => {
    const { scene, emitted } = mountViewport('ruler')
    await fireEvent.pointerDown(scene, { clientX: 20, clientY: 20 })
    await fireEvent.pointerMove(scene, { clientX: 65, clientY: 50 })
    await fireEvent.keyDown(window, { key, shiftKey, altKey })
    await fireEvent.pointerUp(scene, { clientX: 65, clientY: 50, shiftKey, altKey })
    const vector = delta(addedRuler(emitted()))
    expect(Math.atan2(vector.y, vector.x) * 180 / Math.PI).toBeCloseTo(angle)
  })

  it('returns to raw coordinates when Shift is released without moving', async () => {
    const { scene, emitted } = mountViewport('ruler')
    await fireEvent.pointerDown(scene, { clientX: 20, clientY: 20 })
    await fireEvent.pointerMove(scene, { clientX: 65, clientY: 50 })
    await fireEvent.keyDown(window, { key: 'Shift', shiftKey: true })
    await fireEvent.keyUp(window, { key: 'Shift', shiftKey: false })
    await fireEvent.pointerUp(scene, { clientX: 65, clientY: 50 })
    expect(delta(addedRuler(emitted()))).toEqual({ x: 45, y: 30 })
  })

  it.each(['start', 'end'] as const)('snaps the %s handle and keeps the opposite end fixed', async (handle) => {
    const ruler = precisionLayerFixture('ruler') as RulerLayer
    const { scene, emitted } = mountViewportDocument('select', { ...documentFixture(), layers: [ruler] }, undefined, ruler.id)
    const from = transformedPoint(ruler.transform, ruler.payload[handle])
    await fireEvent.pointerDown(scene, { clientX: from.x, clientY: from.y })
    await fireEvent.pointerMove(scene, { clientX: 55, clientY: 50 })
    await fireEvent.keyDown(window, { key: 'Shift', shiftKey: true })
    expect(emitted().documentCommand).toBeUndefined()
    await fireEvent.pointerUp(scene, { clientX: 55, clientY: 50, shiftKey: true })
    expect(emitted().documentCommand).toHaveLength(1)
    const command = (emitted().documentCommand as unknown[][])[0]![0] as { after: RulerLayer }
    const vector = delta(command.after)
    expect(Math.abs(vector.x)).toBeCloseTo(Math.abs(vector.y))
    const fixed = handle === 'start' ? 'end' : 'start'
    expect(transformedPoint(command.after.transform, command.after.payload[fixed]))
      .toEqual(transformedPoint(ruler.transform, ruler.payload[fixed]))
  })
})
