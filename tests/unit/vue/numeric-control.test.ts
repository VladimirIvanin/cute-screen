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

async function key(
  target: HTMLElement,
  init: KeyboardEventInit,
): Promise<boolean> {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  await fireEvent(target, event)
  return !event.defaultPrevented
}

const props = { label: 'Opacity', value: 0.5, min: 0, max: 1, step: 0.01, displayScale: 100, unit: '%' }

describe('numeric parameter gestures', () => {
  it('projects an atomic style payload without confirming the numeric gesture', async () => {
    const preview = vi.fn()
    const view = render(NumericControl, {
      props: { label: 'Padding', value: 8, min: 0, max: 256, step: 1, controlId: 'calloutFrame',
        previewValue: (padding: number) => JSON.stringify({ kind: 'card', padding, radius: 14 }) },
      global: { provide: { [numericPreviewKey as symbol]: { preview, cancel: vi.fn() } } },
    })
    await fireEvent.keyDown(view.getByRole('spinbutton'), { key: 'ArrowUp' })
    expect(preview).toHaveBeenLastCalledWith(expect.any(Symbol), expect.objectContaining({ id: 'calloutFrame' }),
      JSON.stringify({ kind: 'card', padding: 9, radius: 14 }))
    expect(view.emitted('commit')).toBeUndefined()
  })
  it('handles small decimal steps, rejects rounded large fractions and recovers from IME blur', async () => {
    const view = render(NumericControl, { props: { label: 'Value', value: 0.0000001, min: 0, max: 1, step: 0.0000001 } })
    const input = view.getByRole('spinbutton')
    expect(input).toHaveValue('0.0000001')
    await fireEvent.keyDown(input, { key: 'ArrowUp' })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(view.emitted('commit')).toEqual([[0.0000002]])
    await view.rerender({ value: 1, min: 1, max: Number.MAX_SAFE_INTEGER, step: 1 })
    await fireEvent.update(input, '9007199254740991.1')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    await fireEvent.compositionStart(input)
    await fireEvent.update(input, '2')
    await fireEvent(window, new Event('blur'))
    await fireEvent.keyDown(input, { key: 'ArrowUp' })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(view.emitted('commit')?.at(-1)).toEqual([2])
  })
  it('finishes valid blur once, discards invalid blur and preserves wheel propagation', async () => {
    const view = render(NumericControl, { props })
    const input = view.getByRole('spinbutton')
    await fireEvent.update(input, '37')
    await fireEvent.blur(input, { relatedTarget: document.body })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(view.emitted('commit')).toEqual([[0.37]])
    await view.rerender({ value: 0.37 })
    await fireEvent.update(input, '-')
    await fireEvent.blur(input, { relatedTarget: document.body })
    expect(input).toHaveValue('37')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    const wheel = vi.fn()
    document.body.addEventListener('wheel', wheel)
    try {
      await fireEvent.wheel(input, { deltaY: 100 })
      expect(wheel).toHaveBeenCalledOnce()
      expect(view.emitted('commit')).toHaveLength(1)
    } finally {
      document.body.removeEventListener('wheel', wheel)
    }
  })

  it('does not commit after window blur, external value changes or disabled state', async () => {
    const view = render(NumericControl, { props })
    const input = view.getByRole('spinbutton')
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await fireEvent(window, new Event('blur'))
    await fireEvent.keyDown(input, { key: 'ArrowDown', repeat: true })
    await fireEvent.keyUp(document.body, { key: 'ArrowDown' })
    expect(input).toHaveValue('50')
    await fireEvent.keyDown(input, { key: 'ArrowUp' })
    await view.rerender({ value: 0.2 })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(input).toHaveValue('20')
    await fireEvent.keyDown(input, { key: 'ArrowUp' })
    await view.rerender({ disabled: true })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(view.emitted('commit')).toBeUndefined()
  })

  it('steps decimal grids without drift, stops at bounds and waits for all held keys', async () => {
    const view = render(NumericControl, { props: { label: 'Ratio', value: 0.1, min: 0, max: 1, step: 0.1 } })
    const input = view.getByRole('spinbutton')
    await fireEvent.keyDown(input, { key: 'ArrowUp' })
    await fireEvent.keyDown(input, { key: 'ArrowUp', repeat: true })
    expect(input).toHaveValue('0.3')
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(view.emitted('commit')).toBeUndefined()
    await fireEvent.keyUp(document.body, { key: 'ArrowDown' })
    expect(view.emitted('commit')).toEqual([[0.2]])
    await view.rerender({ value: 1 })
    await fireEvent.keyDown(input, { key: 'ArrowUp' })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(view.emitted('commit')).toHaveLength(1)
  })

  it('preserves source precision and supports safe large integers', async () => {
    const value = 0.1234567890123
    const view = render(NumericControl, { props: { label: 'Value', value, min: 0, max: 1, step: 0.0000000000001 } })
    const input = view.getByRole('spinbutton')
    expect(input).toHaveValue(String(value))
    await view.rerender({ value: Number.MAX_SAFE_INTEGER - 1, min: 1, max: Number.MAX_SAFE_INTEGER, step: 1 })
    await fireEvent.keyDown(input, { key: 'ArrowUp' })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(view.emitted('commit')).toEqual([[Number.MAX_SAFE_INTEGER]])
  })

  it('displays scaled decimals cleanly and steps a preserved off-grid source directionally', async () => {
    const view = render(NumericControl, { props: { ...props, value: 0.29 } })
    const input = view.getByRole('spinbutton')
    expect(input).toHaveValue('29')
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await fireEvent.keyUp(input, { key: 'ArrowDown' })
    expect(view.emitted('commit')).toEqual([[0.28]])
    await view.rerender({ value: 0.295 })
    expect(input).toHaveValue('29.5')
    await fireEvent.keyDown(input, { key: 'ArrowUp' })
    await fireEvent.keyUp(input, { key: 'ArrowUp' })
    expect(view.emitted('commit')?.at(-1)).toEqual([0.3])
  })

  it('does not commit typed input when moving the caret', async () => {
    const view = render(NumericControl, { props })
    const input = view.getByRole('spinbutton')
    await fireEvent.update(input, '37')
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End']) {
      await fireEvent.keyDown(input, { key })
      await fireEvent.keyUp(input, { key })
    }
    expect(view.emitted('commit')).toBeUndefined()
  })

  it('leaves invalid and mixed values unchanged by arrows', async () => {
    const view = render(NumericControl, { props })
    const input = view.getByRole('spinbutton')
    for (const value of ['', '-', 'wrong', '101', '2.1']) {
      await fireEvent.update(input, value)
      await fireEvent.keyDown(input, { key: 'ArrowUp' })
      await fireEvent.keyUp(input, { key: 'ArrowUp' })
      expect(input).toHaveValue(value)
      expect(input).not.toHaveAttribute('aria-valuenow')
    }
    await fireEvent.keyDown(input, { key: 'Escape' })
    await view.rerender({ mixed: true })
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    await fireEvent.keyUp(input, { key: 'ArrowDown' })
    expect(input).toHaveValue('')
    expect(view.emitted('commit')).toBeUndefined()
  })

  it('consumes the first Escape and ignores held repeats after cancellation', async () => {
    const view = render(NumericControl, { props })
    const input = view.getByRole('spinbutton')
    await fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(await key(input, { key: 'Escape' })).toBe(false)
    await fireEvent.keyDown(input, { key: 'ArrowDown', repeat: true })
    await fireEvent.keyUp(input, { key: 'ArrowDown' })
    expect(input).toHaveValue('50')
    expect(view.emitted('commit')).toBeUndefined()
    expect(await key(input, { key: 'Escape' })).toBe(true)
  })

  it('keeps IME and preset keyboard events out of numeric handlers', async () => {
    const view = render(NumericControl, { props: { ...props, presets: [0.25, 0.5] } })
    const input = view.getByRole('spinbutton')
    await fireEvent.update(input, '37')
    expect(await key(input, { key: 'Enter', isComposing: true })).toBe(true)
    expect(await key(input, { key: 'ArrowUp', isComposing: true })).toBe(true)
    const preset = view.getByRole('button', { name: '25 %' })
    expect(await key(preset, { key: 'Enter' })).toBe(true)
    await fireEvent.keyUp(preset, { key: 'ArrowUp' })
    expect(view.emitted('commit')).toBeUndefined()
    expect(input).toHaveValue('37')
  })

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
