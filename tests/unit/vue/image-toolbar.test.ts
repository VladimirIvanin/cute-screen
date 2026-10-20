import {
  fireEvent,
  render,
  waitFor,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import ContextToolbar from '../../../packages/editor-vue/src/shell/components/ContextToolbar.vue'
import type { ContextToolbarSchema } from '../../../packages/editor-vue/src/shell/types'
import { numericPreviewKey } from '../../../packages/editor-vue/src/shell/ui/numeric-preview'

const schema: ContextToolbarSchema = {
  icon: 'image', title: 'Image', hint: '', controls: [
    { kind: 'range', id: 'imageRadius', label: 'Radius', value: 31, min: 0, max: 1080, step: 1 },
    { kind: 'color', id: 'imageBorderColor', label: 'Border color', value: '#000000', eyedropper: true },
    { kind: 'range', id: 'imageBorderWidth', label: 'Border width', value: 0, min: 0, max: 32, step: 1 },
    { kind: 'range', id: 'imageOpacity', label: 'Opacity', value: 1, min: 0, max: 1, step: 0.05 },
  ],
}
function mount(
  next = schema,
  locale: 'en' | 'ru' = 'en',
) {
  const preview = vi.fn(), cancel = vi.fn()
  return { preview, cancel, ...render(ContextToolbar, {
    props: { schema: next, label: 'Image', pickerLocale: locale, recentColors: [] },
    global: { provide: { [numericPreviewKey as symbol]: { preview, cancel } } },
  }) }
}
describe('compact image formatting', () => {
  it.each(['en', 'ru'] as const)('shows three summaries with no expanded fields in %s', (locale) => {
    const view = mount(schema, locale)
    expect(view.container.querySelectorAll('[data-image-control]')).toHaveLength(3)
    expect(view.container).toHaveTextContent(locale === 'ru' ? 'нет' : 'none')
    expect(view.container).toHaveTextContent('31 px')
    expect(view.container).toHaveTextContent('100%')
    expect(view.queryByRole('spinbutton')).toBeNull()
    expect(view.container.querySelector('.cs-context-icon')).toBeNull()
  })
  it('previews percentages, commits once, and cancels Escape with focus restoration', async () => {
    const view = mount()
    const trigger = view.getByRole('button', { name: 'Opacity' })
    await fireEvent.click(trigger)
    const input = await view.findByRole('spinbutton', { name: 'Opacity' })
    await fireEvent.update(input, '55')
    expect(view.preview).toHaveBeenLastCalledWith(expect.any(Symbol), expect.objectContaining({ id: 'imageOpacity' }), '0.55')
    expect(view.emitted('change')).toBeUndefined()
    await fireEvent.keyDown(input, { key: 'Enter' })
    await fireEvent.blur(input)
    expect(view.emitted('change')).toEqual([['imageOpacity', '0.55']])
    await fireEvent.update(input, '80')
    await fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toBeInTheDocument()
    await fireEvent.keyDown(input, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(view.cancel).toHaveBeenCalled()
    expect(view.emitted('change')).toHaveLength(1)
  })
  it('opens one menu at a time and groups border width, palette, HEX and sampling', async () => {
    const view = mount()
    await fireEvent.click(view.getByRole('button', { name: 'Radius' }))
    await view.findByRole('spinbutton', { name: 'Radius' })
    await fireEvent.click(view.getByRole('button', { name: 'Border' }))
    await view.findByRole('spinbutton', { name: 'Border width' })
    expect(view.queryByRole('spinbutton', { name: 'Radius' })).toBeNull()
    expect(view.getAllByRole('dialog')).toHaveLength(1)
    await fireEvent.click(view.getByRole('button', { name: 'Red' }))
    expect(view.emitted('change')?.at(-1)).toEqual(['imageBorderColor', '#FF7556'])
    await fireEvent.click(view.getByRole('button', { name: /custom/i }))
    expect(view.getByRole('textbox', { name: /hex/i })).toBeVisible()
  })
  it('shows mixed values and prevents every edit for a locked/read-only selection', async () => {
    const view = mount({ ...schema, disabled: true,
      controls: schema.controls.map((control) => ({ ...control, mixed: true, disabled: true })) })
    for (const trigger of view.container.querySelectorAll('[data-image-control]')) {
      expect(trigger).toBeDisabled()
      expect(trigger).toHaveTextContent('—')
      await fireEvent.click(trigger)
    }
    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.emitted('change')).toBeUndefined()
  })
  it('routes the embedded eyedropper to the selected image and closes the menu', async () => {
    const view = mount()
    const trigger = view.getByRole('button', { name: 'Border' })
    await fireEvent.click(trigger)
    await fireEvent.click(await view.findByRole('button', { name: /custom/i }))
    await fireEvent.click(await view.findByRole('button', { name: /sample.*canvas/i }))
    expect(view.emitted('eyedropper')).toEqual([['imageBorderColor']])
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})
