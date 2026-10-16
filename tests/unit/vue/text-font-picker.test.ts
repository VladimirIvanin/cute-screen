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
import TextFontPicker from '../../../packages/editor-vue/src/shell/ui/TextFontPicker.vue'
import * as fonts from '../../../packages/editor-vue/src/text-fonts'

describe('curated text font menu', () => {
  it('previews exactly twelve local families without applying hover and supports keyboard commit', async () => {
    const view = render(TextFontPicker, { props: { modelValue: 'Roboto', ariaLabel: 'Font family', previewText: 'Привет 😀 ' + 'x'.repeat(40) } })
    const trigger = view.getByRole('button', { name: 'Font family' })
    await fireEvent.click(trigger)
    await waitFor(() => expect(view.getByRole('option', { name: 'Lora' })).not.toBeDisabled())
    const options = view.getAllByRole('option')
    expect(options).toHaveLength(12)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    const preview = options[0]!.querySelector('.cs-text-font-sample')!
    expect(Array.from(preview.textContent!).length).toBe(32)
    expect(preview).toHaveStyle({ fontFamily: 'Roboto' })
    await fireEvent.mouseEnter(view.getByRole('option', { name: 'Lora' }))
    expect(view.emitted().commit).toBeUndefined()
    const panel = view.getByRole('listbox')
    await fireEvent.keyDown(panel, { key: 'End' })
    expect(view.getByRole('option', { name: 'Marck Script' })).toHaveFocus()
    await fireEvent.keyDown(panel, { key: 'Home' })
    expect(options[0]).toHaveFocus()
    await fireEvent.keyDown(panel, { key: 'ArrowDown' })
    expect(options[1]).toHaveFocus()
    await fireEvent.click(options[1]!)
    expect(view.emitted().commit).toEqual([['Manrope']])
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('shows loading, failure and retry without applying an unavailable face', async () => {
    let rejectLoad: (error: Error) => void = () => undefined
    const load = vi.spyOn(fonts, 'loadTextFontFamily').mockImplementation(() => new Promise((_resolve, reject) => {
      rejectLoad = reject
    }))
    const diagnostic = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const view = render(TextFontPicker, { props: { modelValue: 'Arial', ariaLabel: 'Шрифт', locale: 'ru' } })
    await fireEvent.click(view.getByRole('button', { name: 'Шрифт' }))
    expect(view.getByText(/Вне встроенного набора/u)).toBeInTheDocument()
    expect(view.getByRole('option', { name: 'Marck Script' })).toBeDisabled()
    rejectLoad(new Error('Missing local asset'))
    const retry = await view.findByRole('button', { name: 'Повторить: Marck Script' })
    expect(view.emitted().commit).toBeUndefined()
    load.mockResolvedValue(undefined)
    await fireEvent.click(retry)
    await waitFor(() => expect(view.getByRole('option', { name: 'Marck Script' })).not.toBeDisabled())
    await fireEvent.keyDown(view.getByRole('listbox'), { key: 'Escape' })
    await waitFor(() => expect(view.getByRole('button', { name: 'Шрифт' })).toHaveFocus())
    load.mockRestore()
    diagnostic.mockRestore()
  })

  it('evicts failed font loads so retry can succeed and waits for both scripts', async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error('Read failed')).mockResolvedValue([{}])
    const original = Object.getOwnPropertyDescriptor(document, 'fonts')
    Object.defineProperty(document, 'fonts', { configurable: true, value: { load } })
    try {
      await expect(fonts.loadTextFont('Lora')).rejects.toThrow('Read failed')
      await fonts.loadTextFont('Lora')
      await fonts.loadTextFont('Lora')
      expect(load).toHaveBeenCalledTimes(2)
      expect(load).toHaveBeenLastCalledWith('normal 400 20px "Lora"', 'Aa Яя 123')
    } finally {
      if (original) Object.defineProperty(document, 'fonts', original)
      else Reflect.deleteProperty(document, 'fonts')
    }
  })
})
