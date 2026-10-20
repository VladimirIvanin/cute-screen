import {
  fireEvent,
  render,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
} from 'vitest'
import CardNumber from '../../../packages/editor-vue/src/shell/composition/CardNumber.vue'

describe('appearance number draft', () => {
  it('ignores native change until an explicit completion and cancels with Escape', async () => {
    const view = render(CardNumber, { props: { label: 'Inset', value: 1, min: 0, max: 200 } })
    const input = view.getByRole('spinbutton')
    await fireEvent.input(input, { target: { value: '24' } })
    await fireEvent.change(input)
    expect(view.emitted('change')).toBeUndefined()
    await fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('1')
    await fireEvent.input(input, { target: { value: '2,5' } })
    await fireEvent.blur(input, { relatedTarget: document.body })
    expect(input).toHaveValue('1')
    expect(view.emitted('change')).toBeUndefined()
  })
})
