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
import SimpleColorPicker from '../../../packages/editor-vue/src/shell/ui/SimpleColorPicker.vue'
import type { ContextToolbarSchema } from '../../../packages/editor-vue/src/shell/types'

function numericSchema(
  kind: 'ruler' | 'loupe' | 'pencil' | 'spotlight',
  id: string,
  label: string,
  value: number,
  mixed = false,
): ContextToolbarSchema {
  return {
    icon: kind,
    title: kind,
    hint: '',
    ...(kind === 'loupe' ? {} : { toolSettings: { kind } }),
    controls: [{ kind: 'range', id, label, value, min: 0, max: 100, step: 1, mixed }],
  }
}

describe('popover initial focus', () => {
  it.each([
    ['ruler', 'rulerThickness', 'Thickness', 'Thickness', 4, '4 px'],
    ['ruler', 'rulerFontSize', 'Label size', 'Label size', 24, '24 px'],
    ['loupe', 'loupeZoom', 'Zoom', 'Zoom', 4, '4 ×'],
    ['pencil', 'layerOpacity', 'Opacity', 'Opacity and blending', 75, '75 %'],
    ['spotlight', 'spotlightDimOpacity', 'Dimming', 'Dimming', 65, '65 %'],
  ] as const)('focuses the selected %s %s preset instead of the first one', async (kind, id, label, menu, value, preset) => {
    const view = render(ContextToolbar, {
      props: { schema: numericSchema(kind, id, label, value), label: kind },
    })
    const trigger = screen.getByRole('button', { name: menu })
    await fireEvent.click(trigger)
    const panel = await screen.findByRole('dialog', { name: menu })
    expect(within(panel).getByRole('button', { name: preset, pressed: true })).toHaveFocus()
    expect(view.emitted('change')).toBeUndefined()
    await fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(trigger).toHaveFocus()
  })

  it.each([false, true])('focuses the numeric field when no preset is selected (mixed: %s)', async (mixed) => {
    render(ContextToolbar, {
      props: { schema: numericSchema('ruler', 'rulerThickness', 'Thickness', 5, mixed), label: 'Ruler' },
    })
    await fireEvent.click(screen.getByRole('button', { name: 'Thickness' }))
    const panel = await screen.findByRole('dialog', { name: 'Thickness' })
    expect(within(panel).queryByRole('button', { pressed: true })).toBeNull()
    expect(within(panel).getByRole('spinbutton', { name: 'Thickness' })).toHaveFocus()
  })

  it('focuses the current highlighter mode instead of Auto', async () => {
    render(ContextToolbar, { props: {
      label: 'Highlighter',
      schema: {
        icon: 'marker', title: 'Highlighter', hint: '', highlighter: { status: 'ready', effect: 'illuminate' },
        controls: [{ kind: 'select', id: 'markerMode', label: 'Effect', value: 'illuminate', options: [] }],
      },
    } })
    await fireEvent.click(screen.getByRole('button', { name: 'Effect' }))
    const panel = await screen.findByRole('dialog', { name: 'Effect' })
    expect(within(panel).getByRole('button', { name: 'Illuminate', pressed: true })).toHaveFocus()
  })

  it.each([
    ['#78D66D', false, 'Green'],
    ['#123456', false, 'Custom colour'],
    ['#123456', true, 'Yellow'],
  ] as const)('focuses the current colour or first swatch for mixed values (%s, %s)', async (modelValue, mixed, name) => {
    const view = render(SimpleColorPicker, { props: { modelValue, mixed, ariaLabel: 'Colour', palette: 'highlighter' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Colour' }))
    const panel = await screen.findByRole('dialog', { name: 'Colour' })
    expect(within(panel).getByRole('button', { name })).toHaveFocus()
    expect(view.emitted('commit')).toBeUndefined()
  })
})
