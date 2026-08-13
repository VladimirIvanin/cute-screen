import { fireEvent, render, screen } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import DeferredColorPicker from '../../../packages/editor-vue/src/shell/ui/DeferredColorPicker.vue'
import DeferredNumberInput from '../../../packages/editor-vue/src/shell/ui/DeferredNumberInput.vue'
import DeferredSlider from '../../../packages/editor-vue/src/shell/ui/DeferredSlider.vue'

describe('Naive UI editor control adapters', () => {
  it('exposes a labelled slider without committing on mount', async () => {
    const view = render(DeferredSlider, {
      props: {
        modelValue: 10,
        min: 0,
        max: 100,
        step: 1,
        ariaLabel: 'Opacity',
      },
    })
    const slider = view.container.querySelector('.n-slider')
    expect(slider).toBeTruthy()
    expect(
      await view.findByRole('slider', { name: 'Opacity' }),
    ).toBeInTheDocument()

    const emitted = view.emitted('commit') ?? []
    expect(emitted).toHaveLength(0)
  })

  it('keeps number and colour edits pending until their completion boundary', () => {
    const number = render(DeferredNumberInput, {
      props: {
        modelValue: 20,
        min: 0,
        max: 100,
        step: 1,
        ariaLabel: 'Rotation',
      },
    })
    expect(number.getByRole('textbox')).toBeInTheDocument()
    expect(number.emitted('commit')).toBeUndefined()

    const color = render(DeferredColorPicker, {
      props: { modelValue: '#d14b7c', ariaLabel: 'Colour' },
    })
    expect(color.getByRole('button', { name: 'Colour' })).toBeInTheDocument()
    expect(color.emitted('commit')).toBeUndefined()
  })

  it('provides a 32-colour keyboard grid and commits only completed picker edits', async () => {
    const root = document.createElement('div')
    root.className = 'cs-overlay-root'
    document.body.append(root)
    const color = render(DeferredColorPicker, {
      props: { modelValue: '#d14b7c', ariaLabel: 'Colour', locale: 'en' },
    })

    await fireEvent.click(color.getByRole('button', { name: 'Colour' }))
    const grid = await screen.findByRole('listbox')
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(32)
    expect(options[0]).toHaveAttribute('style', expect.stringContaining('255'))
    expect(options[7]).toHaveAttribute('style', expect.stringContaining('0'))

    await fireEvent.keyDown(options[0]!, { key: 'End' })
    expect(document.activeElement).toBe(options[31])
    await fireEvent.click(options[0]!)
    expect(color.emitted('commit')).toEqual([['#FFFFFF']])

    const hex = screen.getByRole('textbox')
    await fireEvent.change(hex, { target: { value: '#bad' } })
    expect(color.emitted('commit')).toEqual([['#FFFFFF'], ['#BBAADD']])
    await fireEvent.change(hex, { target: { value: 'nope' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(color.emitted('commit')).toEqual([['#FFFFFF'], ['#BBAADD']])
    expect(grid).toBeInTheDocument()

    color.unmount()
    root.remove()
  })
})
