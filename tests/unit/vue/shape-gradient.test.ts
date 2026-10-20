import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import ShapeGradientEditor from '../../../packages/editor-vue/src/shell/components/ShapeGradientEditor.vue'
import {
  angleGradient,
  gradientAngle,
  interpolateStop,
  newLinearGradient,
  parseLinearGradient,
  reverseGradient,
  type LinearFill,
} from '../../../packages/editor-vue/src/shell/ui/shape-gradient'
import { resolveDrawingPayload } from '../../../packages/editor-vue/src/shell/tools/effects/drawing-payload'

const red = { red: 1, green: 0, blue: 0, alpha: 1 }
const blue = { red: 0, green: 0, blue: 1, alpha: 0.3 }
const fill: LinearFill = { kind: 'linearGradient', opacity: 0.7, start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, stops: [{ position: 0, color: red }, { position: 1, color: blue }] }
function mount(
  value = fill,
  disabled = false,
) {
  const view = render(ShapeGradientEditor, { props: { fill: value, disabled, locale: 'en', recentColors: [] } })
  const track = view.container.querySelector('.cs-gradient-track')!
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 100 } as DOMRect)
  return { ...view, track, latest: () => (view.emitted('commit') as [LinearFill][]).at(-1)![0] }
}
describe('shape gradient controls', () => {
  it('keeps radial stops, alpha and opacity when converting; seeds a matching transparent colour', () => {
    expect(newLinearGradient({ kind: 'radialGradient', opacity: 0.7, center: { x: 0.5, y: 0.5 }, radius: 0.5, stops: fill.stops }, red)).toMatchObject({ stops: fill.stops, opacity: 0.7 })
    const seeded = newLinearGradient({ kind: 'solid', color: blue, opacity: 0.4 }, red)
    expect(seeded.stops[1]!.color).toEqual({ ...blue, alpha: 0 })
    expect(seeded.opacity).toBe(0.4)
    for (const angle of [0, 45, 90, 180, 270, 359]) expect(gradientAngle(angleGradient(fill, angle))).toBe(angle)
    expect(reverseGradient(reverseGradient(fill))).toEqual(fill)
    expect(interpolateStop(fill.stops, 0.5).color).toEqual({ red: 0.5, green: 0, blue: 0.5, alpha: 0.65 })
  })
  it('rejects malformed atomic paints before defaults or commands', () => {
    const current = { shape: 'rectangle', fill: { ...fill, start: { ...fill.start }, end: { ...fill.end } }, stroke: { style: 'solid' } }
    expect(resolveDrawingPayload('fillKind', 'linearGradient', 'shape', current)).toBe(current)
    expect(resolveDrawingPayload('fillKind', 'radialGradient', 'shape', current)).toBeUndefined()
    for (const value of ['invalid', 'null', JSON.stringify({ ...fill, stops: [] }), JSON.stringify({ ...fill, stops: [...fill.stops].reverse() }), JSON.stringify({ ...fill, opacity: 2 }), JSON.stringify({ ...fill, end: fill.start })]) expect(parseLinearGradient(value)).toBeUndefined()
    expect(resolveDrawingPayload('fillGradient', JSON.stringify(fill), 'shape', current)?.fill).toEqual(fill)
    expect(resolveDrawingPayload('fillGradient', JSON.stringify(fill), 'shape', { ...current, shape: 'braceLeft' })).toBeUndefined()
    expect(resolveDrawingPayload('strokeStyle', 'dotted', 'shape', current)?.stroke).toMatchObject({ style: 'dotted' })
  })
  it('adds interpolated points, permits eight, and refuses a ninth', async () => {
    const view = mount()
    await fireEvent.click(view.track, { clientX: 50 })
    expect(view.latest().stops[1]).toEqual(interpolateStop(fill.stops, 0.5))
    await view.rerender({ fill: view.latest() })
    for (let i = 0; i < 5; i++) {
      await fireEvent.click(view.track, { clientX: 10 + i * 10 })
      await view.rerender({ fill: view.latest() })
    }
    expect(screen.getAllByRole('slider', { name: /Gradient stop/ })).toHaveLength(8)
    const count = view.emitted('commit').length
    await fireEvent.click(view.track, { clientX: 95 })
    expect(view.emitted('commit')).toHaveLength(count)
  })
  it('moves using keys, edits colour/opacity and direction independently', async () => {
    const view = mount()
    await fireEvent.keyDown(screen.getByRole('slider', { name: 'Gradient stop 1' }), { key: 'ArrowRight' })
    expect(view.latest().stops[0]!.position).toBe(0.01)
    await view.rerender({ fill: view.latest() })
    await fireEvent.click(screen.getByRole('button', { name: 'Green' }))
    expect(view.latest().stops[0]!.color.alpha).toBe(1)
    const opacity = screen.getByRole('spinbutton', { name: 'Stop opacity' })
    await fireEvent.update(opacity, '40')
    await fireEvent.keyDown(opacity, { key: 'Enter' })
    expect(view.latest().stops[0]!.color.alpha).toBe(0.4)
    expect(view.latest().opacity).toBe(0.7)
    const angle = screen.getByRole('spinbutton', { name: 'Angle' })
    await fireEvent.update(angle, '90')
    await fireEvent.keyDown(angle, { key: 'Enter' })
    expect(gradientAngle(view.latest())).toBe(90)
    await fireEvent.click(screen.getByRole('button', { name: 'Reverse gradient colours' }))
    expect(view.latest()).toEqual(reverseGradient({
      ...fill, stops: [{ ...fill.stops[0]!, position: 0.01 }, fill.stops[1]!],
    }))
  })
  it('protects the last two points and restores focus after removal', async () => {
    const view = mount()
    expect(screen.getByRole('button', { name: 'Remove gradient stop' })).toBeDisabled()
    await fireEvent.click(view.track, { clientX: 50 })
    await view.rerender({ fill: view.latest() })
    const marker = screen.getByRole('slider', { name: 'Gradient stop 2' })
    await fireEvent.keyDown(marker, { key: 'Delete' })
    await view.rerender({ fill: view.latest() })
    expect(view.latest().stops).toHaveLength(2)
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Gradient stop 2' })).toHaveFocus())
  })
  it('adds a point through a keyboard-accessible button and focuses its marker', async () => {
    const view = mount()
    const add = screen.getByRole('button', { name: 'Add gradient stop' })
    add.focus()
    await fireEvent.click(add)
    await view.rerender({ fill: view.latest() })
    expect(view.latest().stops[1]).toEqual(interpolateStop(fill.stops, 0.5))
    await waitFor(() => expect(screen.getByRole('slider', { name: 'Gradient stop 2' })).toHaveFocus())
  })
  it('previews dragging locally, commits once on release, and cancels with Escape', async () => {
    const view = mount()
    const marker = screen.getByRole('slider', { name: 'Gradient stop 1' })
    await fireEvent.pointerDown(marker, { button: 0, pointerId: 1 })
    await fireEvent.pointerMove(marker, { clientX: 40, pointerId: 1 })
    expect(view.emitted('commit')).toBeUndefined()
    expect(marker).toHaveAttribute('aria-valuenow', '40')
    await fireEvent.keyDown(marker, { key: 'Escape' })
    await fireEvent.pointerUp(marker, { pointerId: 1 })
    expect(view.emitted('commit')).toBeUndefined()
    expect(marker).toHaveAttribute('aria-valuenow', '0')
    await fireEvent.pointerDown(marker, { button: 0, pointerId: 2 })
    await fireEvent.pointerMove(marker, { clientX: 60, pointerId: 2 })
    await fireEvent.pointerUp(marker, { pointerId: 2 })
    expect(view.emitted('commit')).toHaveLength(1)
    expect(view.latest().stops[0]!.position).toBe(0.6)
  })
  it('blocks pointer and keyboard changes while disabled', async () => {
    const view = mount(fill, true)
    await fireEvent.click(view.track, { clientX: 50 })
    await fireEvent.keyDown(screen.getByRole('slider', { name: 'Gradient stop 1' }), { key: 'ArrowRight' })
    expect(view.emitted('commit')).toBeUndefined()
    expect(screen.getByRole('button', { name: 'Reverse gradient colours' })).toBeDisabled()
  })
  it('does not interpret the click retargeted to the track after dragging as a new point', async () => {
    const view = mount()
    const marker = screen.getByRole('slider', { name: 'Gradient stop 1' })
    await fireEvent.pointerDown(marker, { button: 0, pointerId: 3 })
    await fireEvent.pointerMove(marker, { clientX: 60, pointerId: 3 })
    await fireEvent.pointerUp(marker, { pointerId: 3 })
    await fireEvent.click(view.track, { clientX: 60 })
    expect(view.emitted('commit')).toHaveLength(1)
    expect(view.latest().stops).toHaveLength(2)
    await view.rerender({ fill: view.latest() })
    await fireEvent.pointerDown(view.track, { button: 0, pointerId: 4 })
    await fireEvent.click(view.track, { clientX: 80 })
    expect(view.latest().stops).toHaveLength(3)
  })
})
