import {
  fireEvent,
  render,
  waitFor,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
} from 'vitest'
import ContextToolbar from '../../../packages/editor-vue/src/shell/components/ContextToolbar.vue'
import type { ContextToolbarSchema } from '../../../packages/editor-vue/src/shell/types'

describe('Crop toolbar disabled state', () => {
  it('disables the teleported preset and commit actions, then restores interaction', async () => {
    const schema: ContextToolbarSchema = {
      icon: 'crop', title: 'Crop', hint: 'Enter applies · Escape cancels', disabled: true,
      controls: [
        { kind: 'select', id: 'cropPreset', label: 'Preset', value: 'free', options: [{ value: 'free', label: 'Free' }] },
        { kind: 'action', id: 'cropReset', label: 'Reset' },
        { kind: 'action', id: 'cropApply', label: 'Apply' },
        { kind: 'action', id: 'cropCancel', label: 'Cancel' },
      ],
    }
    const view = render(ContextToolbar, { props: { schema, label: 'Crop' } })
    const preset = await view.findByRole('combobox', { name: 'Preset' })
    expect(preset).toHaveAttribute('aria-disabled', 'true')
    expect(preset).toHaveAttribute('tabindex', '-1')
    for (const name of ['Reset', 'Cancel', 'Apply']) {
      expect(view.getByRole('button', { name })).toBeDisabled()
    }
    await fireEvent.click(preset)
    expect(view.queryByRole('option')).toBeNull()
    expect(view.emitted('action')).toBeUndefined()
    await view.rerender({ schema: { ...schema, disabled: false } })
    await waitFor(() => expect(view.getByRole('combobox', { name: 'Preset' })).toHaveAttribute('aria-disabled', 'false'))
    await fireEvent.click(view.getByRole('button', { name: 'Apply' }))
    expect(view.emitted('action')).toEqual([['cropApply']])
  })
})
