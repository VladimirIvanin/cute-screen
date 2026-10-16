import {
  fireEvent,
  render,
} from '@testing-library/vue'
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  ref,
  nextTick,
} from 'vue'
import NumericControl from '../../../packages/editor-vue/src/shell/ui/NumericControl.vue'
import { numericPreviewKey } from '../../../packages/editor-vue/src/shell/ui/numeric-preview'

const props = { label: 'Opacity', value: 0.5, min: 0, max: 1, step: 0.01, displayScale: 100, unit: '%' }

describe('numeric parameter gestures', () => {
  it('previews precise input and commits once across Enter and blur', async () => {
    const preview = vi.fn()
    const cancel = vi.fn()
    const view = render(NumericControl, {
      props: { ...props, controlId: 'imageOpacity' },
      global: { provide: { [numericPreviewKey as symbol]: { preview, cancel } } },
    })
    const input = view.getByRole('spinbutton', { name: 'Opacity' })
    await fireEvent.update(input, '37')
    expect(preview).toHaveBeenLastCalledWith(expect.any(Symbol), expect.objectContaining({ id: 'imageOpacity' }), '0.37')
    expect(view.emitted('commit')).toBeUndefined()
    await fireEvent.keyDown(input, { key: 'Enter' })
    await fireEvent.blur(input)
    expect(view.emitted('commit')).toEqual([[0.37]])
    expect(cancel).toHaveBeenCalled()
  })

  it('accepts comma decimals, rejects empty, range and step errors, and cancels with Escape', async () => {
    const view = render(NumericControl, { props: { label: 'Blur', value: 12, min: 0.5, max: 128, step: 0.5 } })
    const input = view.getByRole('spinbutton')
    for (const invalid of ['', 'invalid', '129', '2.1']) {
      await fireEvent.update(input, invalid)
      await fireEvent.keyDown(input, { key: 'Enter' })
      expect(input).toHaveAttribute('aria-invalid', 'true')
    }
    expect(view.emitted('commit')).toBeUndefined()
    await fireEvent.update(input, '2,5')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    await fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('12')
    expect(view.emitted('commit')).toBeUndefined()
    await fireEvent.update(input, '2,5')
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(view.emitted('commit')).toEqual([[2.5]])
  })

  it('coalesces keyboard repeat until keyup and supports Shift and slider endpoints', async () => {
    const view = render(NumericControl, { props: { ...props, slider: true } })
    const slider = await view.findByRole('slider', { name: 'Opacity' })
    await fireEvent.keyDown(slider, { key: 'ArrowRight' })
    await fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true })
    await fireEvent.keyDown(slider, { key: 'ArrowRight', repeat: true, shiftKey: true })
    expect(view.emitted('commit')).toBeUndefined()
    await fireEvent.keyUp(slider, { key: 'ArrowRight' })
    expect(view.emitted('commit')).toEqual([[0.62]])
    await fireEvent.keyDown(slider, { key: 'Home' })
    await fireEvent.keyUp(slider, { key: 'Home' })
    expect(view.emitted('commit')?.at(-1)).toEqual([0])
  })

  it('replaces an unfinished typed value with a preset as one confirmed edit', async () => {
    const view = render(NumericControl, { props: { label: 'Width', value: 3, min: 1, max: 48, step: 1, presets: [4, 8] } })
    const input = view.getByRole('spinbutton')
    const preset = view.getByRole('button', { name: '8' })
    await fireEvent.update(input, '7')
    await fireEvent.blur(input, { relatedTarget: preset })
    await fireEvent.click(preset)
    expect(view.emitted('commit')).toEqual([[8]])
  })

  it('blocks a teleported numeric field when the owning document becomes read-only', async () => {
    const readOnly = ref(false)
    const view = render(NumericControl, {
      props: { ...props, controlId: 'layerOpacity' },
      global: { provide: { [numericPreviewKey as symbol]: {
        preview: vi.fn(), cancel: vi.fn(), isBlocked: () => readOnly.value,
      } } },
    })
    const input = view.getByRole('spinbutton')
    await fireEvent.update(input, '37')
    readOnly.value = true
    await nextTick()
    expect(input).toBeDisabled()
    await fireEvent.keyDown(input, { key: 'Enter' })
    expect(view.emitted('commit')).toBeUndefined()
    expect(input).toHaveValue('50')
  })

  it('keeps mixed values indeterminate until chosen, disables changes and avoids repeated presets', async () => {
    const view = render(NumericControl, { props: { ...props, mixed: true, presets: [0.25, 0.5, 0.75] } })
    expect(view.getByRole('spinbutton')).toHaveValue('')
    for (const button of view.getAllByRole('button')) expect(button).toHaveAttribute('aria-pressed', 'false')
    await fireEvent.click(view.getByRole('button', { name: '50 %' }))
    expect(view.emitted('commit')).toEqual([[0.5]])
    await view.rerender({ mixed: false, value: 0.5 })
    await fireEvent.click(view.getByRole('button', { name: '50 %' }))
    expect(view.emitted('commit')).toHaveLength(1)
    await view.rerender({ disabled: true })
    expect(view.getByRole('spinbutton')).toBeDisabled()
    await fireEvent.keyDown(view.getByRole('spinbutton'), { key: 'ArrowUp' })
    await fireEvent.keyUp(view.getByRole('spinbutton'), { key: 'ArrowUp' })
    expect(view.emitted('commit')).toHaveLength(1)
  })
})
