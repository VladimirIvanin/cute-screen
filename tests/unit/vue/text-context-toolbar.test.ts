import { fireEvent, render, waitFor, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

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
    disabledReason:
      'Lists, padding and radius are unavailable for numbered markers.',
  },
}

describe('v7 text contextual toolbar', () => {
  it('keeps the compact FigJam-style control order and exposes mixed/disabled states', async () => {
    const rendered = render(ContextToolbar, {
      props: { schema, label: 'Tool settings', pickerLocale: 'en' },
    })
    expect(
      [...rendered.container.querySelectorAll('[data-text-control]')].map(
        (node) => node.getAttribute('data-text-control'),
      ),
    ).toEqual([
      'color',
      'font',
      'size',
      'bold',
      'italic',
      'strikethrough',
      'list',
      'alignment',
      'background',
    ])
    expect(rendered.getByLabelText('Bold: mixed')).toHaveAttribute(
      'aria-pressed',
      'mixed',
    )
    expect(rendered.getByLabelText('Bullet list')).toBeDisabled()
    expect(rendered.getByLabelText('Bullet list')).toHaveAttribute(
      'title',
      schema.text.disabledReason,
    )
    await fireEvent.click(rendered.getByLabelText('Background'))
    expect(rendered.getByRole('button', { name: 'None' })).toBeDisabled()
    for (const name of ['Padding', 'Radius']) {
      expect(rendered.getByLabelText(name)).toBeDisabled()
      expect(rendered.getByLabelText(name)).toHaveAttribute(
        'title',
        schema.text.disabledReason,
      )
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
    expect(rendered.getByLabelText('Font family: mixed')).toHaveValue('')
    expect(rendered.getByLabelText('Font size: mixed')).toHaveTextContent('—')
    expect(rendered.getByLabelText('Bullet list')).toHaveAttribute(
      'aria-pressed',
      'mixed',
    )
    expect(rendered.getByLabelText('Text alignment')).toHaveValue('')
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
    const font = rendered.getByLabelText('Font family') as HTMLSelectElement
    await fireEvent.change(font, { target: { value: 'Georgia' } })
    expect(rendered.emitted().change).toContainEqual(['textFont', 'Georgia'])
    const size = rendered.getByLabelText('Font size')
    await fireEvent.click(size)
    const arbitrary = rendered.getByLabelText(
      'Font size value',
    ) as HTMLInputElement
    await fireEvent.update(arbitrary, '257')
    expect(rendered.emitted().change).not.toContainEqual([
      'textFontSize',
      '257',
    ])
    expect(rendered.getByRole('button', { name: 'Apply' })).toBeDisabled()
    await fireEvent.update(arbitrary, '32')
    await fireEvent.click(rendered.getByRole('button', { name: 'Apply' }))
    expect(rendered.emitted().change).toContainEqual(['textFontSize', '32'])
    const background = rendered.getByLabelText('Background')
    await fireEvent.click(background)
    await fireEvent.keyDown(rendered.getByRole('dialog'), { key: 'Escape' })
    expect(background).toHaveFocus()
    await fireEvent.click(background)
    const backgroundDialog = rendered.getByRole('dialog')
    const padding = rendered.getByLabelText('Padding') as HTMLInputElement
    await fireEvent.update(padding, '257')
    expect(
      within(backgroundDialog).getByRole('button', { name: 'Apply' }),
    ).toBeDisabled()
    await fireEvent.pointerDown(document.body)
    await waitFor(() => expect(background).toHaveFocus())
  })

  it('keeps RU accessible names and exposes a no-scroll overflow menu on narrow layouts', async () => {
    const rendered = render(ContextToolbar, {
      props: { schema, label: 'Настройки инструмента', pickerLocale: 'ru' },
    })
    expect(rendered.getByLabelText('Полужирный: смешанное')).toHaveAttribute(
      'aria-pressed',
      'mixed',
    )
    const overflow = rendered.getByLabelText('Дополнительные настройки текста')
    await fireEvent.click(overflow)
    expect(
      rendered.getByRole('dialog', { name: 'Дополнительные настройки текста' }),
    ).toBeInTheDocument()
    expect(
      rendered.container.querySelector('.cs-text-toolbar'),
    ).not.toHaveStyle({ overflowX: 'auto' })

    const overflowDialog = rendered.getByRole('dialog', {
      name: 'Дополнительные настройки текста',
    })
    await fireEvent.click(
      within(overflowDialog).getByRole('button', { name: 'Фон' }),
    )
    await fireEvent.keyDown(rendered.getByRole('dialog'), { key: 'Escape' })
    expect(overflow).toHaveFocus()

    await fireEvent.click(overflow)
    await fireEvent.keyDown(
      rendered.getByRole('dialog', { name: 'Дополнительные настройки текста' }),
      { key: 'Escape' },
    )
    expect(overflow).toHaveFocus()
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
    expect(
      rendered.container.querySelector('.cs-text-floating-toolbar'),
    ).toBeTruthy()
    expect(
      [...rendered.container.querySelectorAll('[data-text-control]')].map(
        (node) => node.getAttribute('data-text-control'),
      ),
    ).toEqual([
      'color',
      'font',
      'size',
      'bold',
      'italic',
      'strikethrough',
      'list',
      'alignment',
      'background',
    ])
  })
})
