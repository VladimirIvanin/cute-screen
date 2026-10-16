import {
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
} from 'vitest'

import ContextToolbar from '../../../packages/editor-vue/src/shell/components/ContextToolbar.vue'
import TextFormattingToolbar from '../../../packages/editor-vue/src/shell/components/TextFormattingToolbar.vue'

const schema = {
  icon: 'text' as const,
  title: 'Text',
  hint: 'Text formatting',
  controls: [],
  text: {
    kind: 'numberedMarker' as const,
    color: '#101010',
    fontFamily: 'Roboto',
    fonts: ['Roboto', 'Arial', 'Georgia'],
    fontSize: 24,
    bold: null,
    italic: false,
    strikethrough: false,
    listKind: 'none' as const,
    alignment: 'start' as const,
    background: null,
    disabled: ['list', 'none', 'padding', 'radius'] as const,
    disabledReason: 'Lists, padding and radius are unavailable for numbered markers.',
  },
}

describe('v7 text contextual toolbar', () => {
  it('keeps the compact FigJam-style control order and exposes mixed/disabled states', async () => {
    const rendered = render(ContextToolbar, {
      props: { schema, label: 'Tool settings', pickerLocale: 'en' },
    })
    expect(
      [...rendered.container.querySelectorAll('[data-text-control]')].map((node) =>
        node.getAttribute('data-text-control')),
    ).toEqual(['color', 'font', 'size', 'bold', 'italic', 'strikethrough', 'list', 'alignment', 'background'])
    expect(rendered.getByLabelText('Bold: mixed')).toHaveAttribute('aria-pressed', 'mixed')
    expect(rendered.getByLabelText('Bullet list')).toBeDisabled()
    expect(rendered.getByLabelText('Bullet list')).toHaveAttribute('title', schema.text.disabledReason)
    await fireEvent.click(rendered.getByLabelText('Background'))
    expect(await rendered.findByRole('button', { name: 'None' })).toBeDisabled()
    for (const name of ['Padding', 'Radius']) {
      expect(rendered.getByRole('spinbutton', { name })).toBeDisabled()
      expect(rendered.getByRole('spinbutton', { name })).toHaveAttribute('title', schema.text.disabledReason)
    }
  })

  it('exposes color, font, size, list and alignment as mixed instead of a global fallback', () => {
    const rendered = render(ContextToolbar, {
      props: {
        schema: {
          ...schema,
          text: {
            ...schema.text,
            kind: 'text',
            color: null,
            fontFamily: null,
            fontSize: null,
            listKind: null,
            alignment: null,
            disabled: [],
          },
        },
        label: 'Tool settings',
      },
    })
    expect(rendered.getByLabelText('Text color: mixed')).toBeInTheDocument()
    expect(rendered.getByLabelText('Font family: mixed')).toHaveTextContent('—')
    expect(rendered.getByLabelText('Font size: mixed')).toHaveTextContent('—')
    expect(rendered.getByLabelText('Bullet list')).toHaveAttribute('aria-pressed', 'mixed')
    expect(within(rendered.getByRole('group', { name: 'Text alignment' })).getAllByRole('button').every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
  })

  it('validates size and restores focus after Escape/cancel in the background popover', async () => {
    const rendered = render(ContextToolbar, {
      props: {
        schema: {
          ...schema,
          text: { ...schema.text, kind: 'text', disabled: [] },
        },
        label: 'Tool settings',
      },
    })
    await fireEvent.click(rendered.getByRole('button', { name: 'Font family' }))
    const option = await rendered.findByRole('option', { name: 'Lora' })
    await waitFor(() => expect(option).not.toBeDisabled())
    await fireEvent.click(option)
    expect(rendered.emitted().change).toContainEqual(['textFont', 'Lora'])
    const size = rendered.getByLabelText('Font size')
    await fireEvent.click(size)
    const arbitrary = await rendered.findByRole('spinbutton', { name: 'Font size value' }) as HTMLInputElement
    await fireEvent.update(arbitrary, '257')
    expect(rendered.emitted().change).not.toContainEqual(['textFontSize', '257'])
    expect(arbitrary).toHaveAttribute('aria-invalid', 'true')
    await fireEvent.update(arbitrary, '32')
    await fireEvent.keyDown(arbitrary, { key: 'Enter' })
    await fireEvent.keyDown(arbitrary, { key: 'Escape' })
    expect(rendered.emitted().change).toContainEqual(['textFontSize', '32'])
    const background = rendered.getByLabelText('Background')
    await fireEvent.click(background)
    await fireEvent.keyDown(await rendered.findByRole('dialog'), { key: 'Escape' })
    expect(background).toHaveFocus()
    await fireEvent.click(background)
    const backgroundDialog = await rendered.findByRole('dialog')
    const padding = rendered.getByRole('spinbutton', { name: 'Padding' }) as HTMLInputElement
    await fireEvent.update(padding, '257')
    expect(within(backgroundDialog).getByRole('button', { name: 'Apply' })).toBeDisabled()
    await fireEvent.pointerDown(document.body)
    await waitFor(() => expect(background).toHaveFocus())
  })

  it('keeps all groups visible with RU names and real alignment buttons', async () => {
    const rendered = render(ContextToolbar, { props: { schema, label: 'Настройки инструмента', pickerLocale: 'ru' } })
    expect(rendered.getByLabelText('Полужирный: смешанное')).toHaveAttribute('aria-pressed', 'mixed')
    expect(rendered.queryByLabelText('Дополнительные настройки текста')).not.toBeInTheDocument()
    await fireEvent.click(rendered.getByRole('button', { name: 'По центру' }))
    expect(rendered.emitted().change).toContainEqual(['textAlign', 'center'])
    expect(rendered.getByRole('button', { name: 'По левому краю' })).toHaveAttribute('aria-pressed', 'true')
    await fireEvent.click(rendered.getByRole('button', { name: 'Фон' }))
    await fireEvent.keyDown(await rendered.findByRole('dialog', { name: 'Фон' }), { key: 'Escape' })
    expect(rendered.getByRole('button', { name: 'Фон' })).toHaveFocus()
  })

  it('commits a foreground swatch but keeps background swatches in the cancellable draft', async () => {
    const rendered = render(TextFormattingToolbar, { props: { text: { ...schema.text, kind: 'text', disabled: [] }, title: 'Text' } })
    await fireEvent.click(rendered.getByRole('button', { name: 'Text color' }))
    await fireEvent.click(await rendered.findByRole('button', { name: 'Red' }))
    expect(rendered.emitted().change).toEqual([['textColor', '#FF7556']])
    await fireEvent.click(rendered.getByRole('button', { name: 'Background' }))
    await fireEvent.click(within(await rendered.findByRole('dialog', { name: 'Background' })).getByRole('button', { name: 'Blue' }))
    expect(rendered.emitted().change).toHaveLength(1)
    await fireEvent.click(rendered.getByRole('button', { name: 'Cancel' }))
    expect(rendered.emitted().change).toHaveLength(1)
    await fireEvent.click(rendered.getByRole('button', { name: 'Background' }))
    await fireEvent.click(within(await rendered.findByRole('dialog', { name: 'Background' })).getByRole('button', { name: 'Green' }))
    await fireEvent.click(rendered.getByRole('button', { name: 'Apply' }))
    expect(rendered.emitted().change).toContainEqual(['textBackground', JSON.stringify({ color: '#66D575', padding: 0, radius: 0 })])
  })

  it('blocks every text control in a read-only context', () => {
    const view = render(TextFormattingToolbar, { props: { text: schema.text, title: 'Text', disabled: true } })
    for (const button of view.getAllByRole('button')) expect(button).toBeDisabled()
  })

  it('renders the same control strip in the floating variant', async () => {
    const rendered = render(TextFormattingToolbar, {
      props: {
        text: schema.text,
        title: 'Text',
        pickerLocale: 'en',
        variant: 'floating',
      },
    })
    expect(rendered.container.querySelector('.cs-text-floating-toolbar')).toBeTruthy()
    expect(
      [...rendered.container.querySelectorAll('[data-text-control]')].map((node) =>
        node.getAttribute('data-text-control')),
    ).toEqual(['color', 'font', 'size', 'bold', 'italic', 'strikethrough', 'list', 'alignment', 'background'])
  })
})
