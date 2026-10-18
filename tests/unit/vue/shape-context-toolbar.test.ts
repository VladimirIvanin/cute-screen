import {
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
} from 'vitest'
import ContextToolbar from '../../../packages/editor-vue/src/shell/components/ContextToolbar.vue'
import type {
  ContextToolbarSchema,
  ShapeFill,
} from '../../../packages/editor-vue/src/shell/types'
import { resolveDrawingPayload } from '../../../packages/editor-vue/src/shell/tools/effects/drawing-payload'

function schema(
  shape = 'rectangle',
  fill: ShapeFill = { kind: 'none' },
): ContextToolbarSchema {
  return {
    icon: 'shape', title: 'Shape', hint: '', shape: { fill },
    controls: [
      { kind: 'color', id: 'color', label: 'Color', value: '#123456', eyedropper: true },
      { kind: 'color', id: 'fillColor', label: 'Fill colour', value: '#AA3344', eyedropper: true },
      ...[['width', 3], ['layerOpacity', 100], ['cornerRadius', 0], ['starPoints', 5], ['starInnerRatio', 0.45], ['fillOpacity', 100]].map(([id, value]) => ({ kind: 'range' as const, id: String(id), label: String(id), value: Number(value), min: 0, max: 200, step: 1 })),
      { kind: 'select', id: 'shapeKind', label: 'Shape', value: shape, options: [] },
      { kind: 'select', id: 'blendMode', label: 'Blend', value: 'normal', options: [] },
      { kind: 'action', id: 'importTexture', label: 'Import texture' },
    ],
  }
}
function mount(
  value = schema(),
  locale: 'en' | 'ru' = 'en',
) {
  return render(ContextToolbar, { props: { schema: value, label: 'Shape', pickerLocale: locale } })
}
describe('compact shape formatting', () => {
  it('shows three visual fill choices, preserves radial display and edits stroke styles', async () => {
    const view = mount(schema('rectangle', { kind: 'radialGradient', center: { x: 0.5, y: 0.5 }, radius: 0.5,
      opacity: 0.6, stops: [
        { position: 0, color: { red: 1, green: 0, blue: 0, alpha: 1 } },
        { position: 1, color: { red: 0, green: 0, blue: 1, alpha: 0 } },
      ],
    }))
    const trigger = screen.getByRole('button', { name: 'Fill: Radial gradient' })
    await fireEvent.click(trigger)
    const options = screen.getByRole('group', { name: 'Fill type' })
    expect(within(options).getAllByRole('button')).toHaveLength(3)
    expect(within(options).queryByRole('button', { name: 'Radial gradient' })).toBeNull()
    await fireEvent.click(within(options).getByRole('button', { name: 'Linear gradient' }))
    const change = view.emitted('change')[0] as [string, string]
    expect(change[0]).toBe('fillGradient')
    expect(JSON.parse(change[1])).toMatchObject({ kind: 'linearGradient', opacity: 0.6 })
    await fireEvent.keyDown(options, { key: 'Escape' })
    expect(trigger).toHaveFocus()
    await fireEvent.click(screen.getByRole('button', { name: /Stroke:/ }))
    await fireEvent.click(screen.getByRole('button', { name: 'Dotted' }))
    expect(view.emitted('change').at(-1)).toEqual(['strokeStyle', 'dotted'])
  })
  it('requires an explicit fill choice before editing mixed gradients', async () => {
    mount({ ...schema(), shape: { fill: null, fillColorEditable: false } })
    await fireEvent.click(screen.getByRole('button', { name: 'Fill: —' }))
    expect(screen.getByText('Mixed fills. Choose a fill type.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Custom colour' })).toBeNull()
    expect(screen.queryByRole('slider', { name: /Gradient stop/ })).toBeNull()
  })
  it('uses one command value for the rounded preset and preserves paint', () => {
    const current = { shape: 'star', fill: { kind: 'none' }, stroke: { width: 7 }, starPoints: 9 }
    const rounded = resolveDrawingPayload('shapeKind', 'roundedRectangle', 'shape', current)!
    expect(rounded).toMatchObject({ shape: 'rectangle', cornerRadius: 12, starPoints: 9 })
    expect(rounded.stroke).toBe(current.stroke)
    expect(resolveDrawingPayload('shapeKind', 'rectangle', 'shape', rounded)).toMatchObject({ cornerRadius: 0 })
    expect(resolveDrawingPayload('shapeKind', 'unsupported', 'shape', rounded)).toBeUndefined()
  })
  it('disables fill on open braces without disabling their geometry', () => {
    const state = schema('braceLeft')
    mount({ ...state, shape: { fill: { kind: 'none' }, fillSupported: false } })
    expect(screen.getByRole('button', { name: 'Fill: No fill' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Shape: Left brace' })).toBeEnabled()
  })
  it('navigates the expanded palette with keyboard arrows and Home/End', async () => {
    mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Shape: Rectangle' }))
    const menu = await screen.findByRole('dialog', { name: 'Shape' })
    const first = within(menu).getByRole('button', { name: 'Rectangle' })
    first.focus()
    await fireEvent.keyDown(first, { key: 'End' })
    const last = within(menu).getByRole('button', { name: 'Cube' })
    expect(last).toHaveFocus()
    await fireEvent.keyDown(last, { key: 'Home' })
    expect(first).toHaveFocus()
    await fireEvent.keyDown(first, { key: 'ArrowRight' })
    expect(within(menu).getByRole('button', { name: 'Rounded rectangle' })).toHaveFocus()
  })
  it('commits a valid numeric edit and rejects values outside its step', async () => {
    const view = mount(schema('star'))
    await fireEvent.click(screen.getByRole('button', { name: 'Shape: Star' }))
    const points = await screen.findByRole('spinbutton', { name: 'Star points' })
    await fireEvent.update(points, '7')
    await fireEvent.keyDown(points, { key: 'Enter' })
    expect(view.emitted('change')).toEqual([['starPoints', '7']])
    await fireEvent.update(points, '7.5')
    await fireEvent.keyDown(points, { key: 'Enter' })
    expect(points).toHaveAttribute('aria-invalid', 'true')
    expect(view.emitted('change')).toHaveLength(1)
  })
  it('shows four controls without decorative icon, sliders or More', () => {
    const view = mount()
    expect(view.container.querySelectorAll('[data-shape-control]')).toHaveLength(4)
    expect(view.container.querySelector('.cs-context-icon')).toBeNull()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
    expect(screen.queryByText('More')).not.toBeInTheDocument()
  })
  it('offers the full named palette and only relevant dimensions', async () => {
    const view = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Shape: Rectangle' }))
    const menu = await screen.findByRole('dialog', { name: 'Shape' })
    expect(within(menu).getAllByRole('button')).toHaveLength(31)
    expect(within(menu).getByRole('spinbutton', { name: 'Corner radius' })).toBeInTheDocument()
    expect(within(menu).queryByRole('spinbutton', { name: 'Star points' })).toBeNull()
    await view.rerender({ schema: schema('star') })
    expect(within(menu).getByRole('spinbutton', { name: 'Star points' })).toBeInTheDocument()
    expect(within(menu).queryByRole('spinbutton', { name: 'Corner radius' })).toBeNull()
  })
  it('opens from keyboard, cancels uncommitted numeric input and restores focus', async () => {
    const view = mount()
    const trigger = screen.getByRole('button', { name: 'Shape: Rectangle' })
    // Native buttons handle Enter/Space; click represents that browser activation.
    await fireEvent.click(trigger)
    const radius = await screen.findByRole('spinbutton', { name: 'Corner radius' })
    await fireEvent.input(radius, { target: { value: '28' } })
    await fireEvent.keyDown(radius, { key: 'Escape' })
    expect(view.emitted('change') ?? []).toEqual([])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
  it('reuses the palette directly, rejects invalid HEX and targets the fill colour', async () => {
    const view = mount()
    await fireEvent.click(screen.getByRole('button', { name: 'Fill: No fill' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Custom colour' }))
    const hex = await screen.findByRole('textbox', { name: 'HEX colour code' })
    await fireEvent.change(hex, { target: { value: '#ZZZZZZ' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(view.emitted('change') ?? []).toEqual([])
    await fireEvent.change(hex, { target: { value: '#778899' } })
    expect(view.emitted('change')).toEqual([['fillColor', '#778899']])
    await fireEvent.click(screen.getByRole('button', { name: 'Sample colour from canvas' }))
    expect(view.emitted('eyedropper')).toEqual([['fillColor']])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('switches a single menu, closes outside, and localizes blend modes', async () => {
    mount(schema(), 'ru')
    await fireEvent.click(screen.getByRole('button', { name: 'Форма: Прямоугольник' }))
    await fireEvent.click(screen.getByRole('button', { name: /Наложение:/ }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('combobox', { name: 'Режим наложения' })).toHaveValue('normal')
    expect(screen.getByRole('option', { name: 'Умножение' })).toBeInTheDocument()
    await fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('displays mixed values and blocks teleported controls when locked', async () => {
    const state = schema()
    const mixed = {
      ...state,
      controls: state.controls.map((control) => ({ ...control, mixed: true })),
      shape: { fill: null },
    }
    const view = mount(mixed)
    expect(screen.getByRole('button', { name: /Shape: —/ })).toBeInTheDocument()
    await fireEvent.click(screen.getByRole('button', { name: /Stroke:/ }))
    await view.rerender({ schema: { ...mixed, disabled: true } })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    for (const button of view.container.querySelectorAll('[data-shape-control]')) expect(button).toBeDisabled()
  })
  it('changes fill independently and preserves advanced paints on unrelated changes', () => {
    const stroke = { color: { red: 1, green: 0, blue: 0, alpha: 1 }, width: 3 }
    const current = { fill: { kind: 'none' }, stroke }
    const result = resolveDrawingPayload('fillColor', '#334455', 'shape', current)!
    expect(result.stroke).toBe(stroke)
    expect(result.fill).toMatchObject({ kind: 'solid', opacity: 1 })
    expect(resolveDrawingPayload('color', '#556677', 'shape', result)!.fill).toEqual(result.fill)
    for (const kind of ['linearGradient', 'radialGradient', 'pattern', 'imageTexture']) {
      const paint = { kind, opacity: 0.4, blobHash: 'immutable-reference' }
      expect(resolveDrawingPayload('width', '8', 'shape', { ...current, fill: paint })!.fill).toBe(paint)
    }
  })
})
