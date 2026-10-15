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

function schema(): ContextToolbarSchema {
  return {
    icon: 'marker', title: 'Highlighter', hint: '', highlighter: { status: 'ready', effect: 'illuminate' },
    controls: [
      { kind: 'color', id: 'color', label: 'Colour', value: '#FFD54A', eyedropper: true },
      { kind: 'range', id: 'width', label: 'Width', value: 18, min: 1, max: 96, step: 1 },
      { kind: 'range', id: 'layerOpacity', label: 'Intensity', value: 35, min: 0, max: 100, step: 1 },
      { kind: 'select', id: 'markerMode', label: 'Effect', value: 'auto', options: [] },
    ],
  }
}

describe('highlighter formatting', () => {
  it('keeps the two-level colour selector for compatible mixed-tool selections', async () => {
    const { highlighter: _analysis, ...state } = schema()
    void _analysis
    render(ContextToolbar, { props: { schema: { ...state, controls: state.controls.slice(0, 3) }, label: 'Selection' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Colour' }))
    expect(await screen.findByRole('button', { name: 'Custom colour' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
  it('shows four compact controls and four human named modes without technical Blend', async () => {
    const view = render(ContextToolbar, { props: { schema: schema(), label: 'Highlighter', pickerLocale: 'ru' } })
    expect(view.container.querySelectorAll('.cs-highlighter-toolbar > button, .cs-simple-color-trigger')).toHaveLength(4)
    expect(screen.getByText('Авто · Подсветить')).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
    expect(screen.queryByText('Blend')).toBeNull()
    await fireEvent.click(screen.getByRole('button', { name: 'Режим' }))
    const panel = await screen.findByRole('dialog', { name: 'Режим' })
    expect(within(panel).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Авто', 'Выделить', 'Подсветить', 'Окрасить'])
    await fireEvent.click(within(panel).getByRole('button', { name: 'Окрасить' }))
    expect(view.emitted('change')).toEqual([['markerMode', 'veil']])
    expect(screen.getByRole('button', { name: 'Режим' })).toHaveFocus()
  })
  it('cancels local numeric input, closes the nearest panel and preserves defaults', async () => {
    const view = render(ContextToolbar, { props: { schema: schema(), label: 'Highlighter', pickerLocale: 'ru' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Толщина' }))
    const input = await screen.findByRole('spinbutton', { name: 'Толщина' })
    await fireEvent.input(input, { target: { value: '28' } })
    await fireEvent.keyDown(input, { key: 'Escape' })
    expect(view.emitted('change') ?? []).toEqual([])
    expect(screen.getByRole('button', { name: 'Толщина' })).toHaveFocus()
  })
  it('displays loading, unavailable and mixed values and blocks locked controls', async () => {
    const state = schema()
    const view = render(ContextToolbar, { props: { schema: { ...state, highlighter: { status: 'loading', effect: 'highlight' } }, label: 'Highlighter', pickerLocale: 'ru' } })
    expect(screen.getByText('Авто · определяем фон')).toBeInTheDocument()
    await view.rerender({ schema: { ...state, highlighter: { status: 'unavailable', effect: 'highlight' } } })
    await fireEvent.click(screen.getByRole('button', { name: 'Режим' }))
    expect(await screen.findByText(/Автоподбор недоступен/)).toBeInTheDocument()
    const controls = state.controls.map((item) => ({ ...item, mixed: true }))
    await view.rerender({ schema: { ...state, disabled: true, controls } })
    expect(screen.getByRole('button', { name: 'Режим' })).toBeDisabled()
    expect(view.container.querySelector('.cs-simple-color-current')).toHaveClass('is-mixed')
  })
})

describe('two level colour palette', () => {
  it.each(['drawing', 'highlighter'] as const)('uses only fixed %s swatches until Custom colour', async (palette) => {
    const view = render(SimpleColorPicker, { props: { modelValue: '#123456', ariaLabel: 'Colour', palette } })
    await fireEvent.click(screen.getByRole('button', { name: 'Colour' }))
    const panel = await screen.findByRole('dialog', { name: 'Colour' })
    expect(within(panel).getAllByRole('button')).toHaveLength(palette === 'drawing' ? 21 : 9)
    expect(within(panel).queryByRole('textbox')).toBeNull()
    const custom = within(panel).getByRole('button', { name: 'Custom colour' })
    expect(custom).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(custom)
    const hex = await screen.findByRole('textbox', { name: 'HEX colour code' })
    await fireEvent.input(hex, { target: { value: '#778899' } })
    await fireEvent.keyDown(hex, { key: 'Escape' })
    expect(view.emitted('commit') ?? []).toEqual([])
    expect(screen.getByRole('button', { name: 'Custom colour' })).toHaveFocus()
    await fireEvent.keyDown(screen.getByRole('button', { name: 'Custom colour' }), { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Colour' })).toHaveFocus()
  })
  it('commits a preset immediately without opening the advanced picker', async () => {
    const view = render(SimpleColorPicker, { props: { modelValue: '#FFD54A', ariaLabel: 'Colour', palette: 'highlighter' } })
    await fireEvent.click(screen.getByRole('button', { name: 'Colour' }))
    await fireEvent.click(await screen.findByRole('button', { name: 'Green' }))
    expect(view.emitted('commit')).toEqual([['#78D66D']])
  })
})
