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
import QuickCaptureActions from '../../../apps/desktop/src/QuickCaptureActions.vue'

describe('compact quick actions', () => {
  it.each(['ru', 'en'] as const)('exposes five named SVG buttons and a separated Close in %s', async (locale) => {
    const view = render(QuickCaptureActions, { props: { locale, pending: false } })
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(5)
    expect(screen.getByRole('separator')).toBeInTheDocument()
    for (const button of buttons) {
      expect(button).toHaveAccessibleName()
      expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
      expect(button.querySelector('.cs-quick-action-tooltip')).toHaveTextContent(button.getAttribute('aria-label')!)
    }
    await fireEvent.click(buttons[3]!)
    expect(view.emitted('history')).toHaveLength(1)
    await view.rerender({ pending: true })
    for (const button of buttons) expect(button).toBeDisabled()
    expect(screen.getByRole('navigation')).toHaveAttribute('aria-busy', 'true')
  })
})
