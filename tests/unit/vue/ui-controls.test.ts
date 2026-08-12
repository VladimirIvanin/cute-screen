import { render } from '@testing-library/vue'
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
})
