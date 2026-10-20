import {
  fireEvent,
  render,
  screen,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
} from 'vitest'
import {
  createCardBranding,
  type CardBranding as Branding,
} from '@cute-screen/editor-renderer'
import CardBranding from '../../../packages/editor-vue/src/shell/composition/CardBranding.vue'

describe('signature editor layout', () => {
  it('selects a flat item and changes its quick colour without losing alpha or other signatures', async () => {
    const first = { ...createCardBranding('first', 2026), text: 'First', template: 'First' }
    const second = { ...createCardBranding('second', 2026), text: 'Second', template: 'Second', color: { red: 1, green: 1, blue: 1, alpha: 0.4 } }
    const view = render(CardBranding, { props: { value: [first, second], selected: 'first', locale: 'en', disabled: false, canImport: false } })
    expect(view.container.querySelector('details')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Refresh year' })).not.toBeInTheDocument()
    await fireEvent.click(view.container.querySelector('[data-brand-id="second"]')!)
    expect(view.emitted('select').at(-1)).toEqual(['second'])
    await view.rerender({ selected: 'second' })
    expect(screen.getByRole('textbox', { name: 'Signature text' })).toHaveValue('Second')
    await fireEvent.click(screen.getByRole('button', { name: 'Blue' }))
    const changed = (view.emitted('change').at(-1) as [Branding[]])[0]
    expect(changed[0]).toEqual(first)
    expect(changed[1]!.color).toEqual({ red: 61 / 255, green: 173 / 255, blue: 1, alpha: 0.4 })
    expect(screen.getByRole('button', { name: 'Import logo' })).toBeDisabled()
    await fireEvent.click(screen.getByRole('button', { name: 'Remove signature' }))
    expect(view.emitted('change').at(-1)).toEqual([[first]])
    expect(view.emitted('select').at(-1)).toEqual(['first'])
  })
  it('offers year refresh only for a template and disables controls with the editor', async () => {
    const block = { ...createCardBranding('first', 2026), template: '© {year}', text: '© 2026' }
    const view = render(CardBranding, { props: { value: [block], locale: 'en', disabled: false, canImport: true } })
    expect(view.emitted('select').at(-1)).toEqual(['first'])
    expect(screen.getByRole('button', { name: 'Refresh year' })).toBeEnabled()
    await view.rerender({ disabled: true })
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Signature text' })).toBeDisabled()
  })
})
