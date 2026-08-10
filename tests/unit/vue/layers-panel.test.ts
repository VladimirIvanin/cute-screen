import { fireEvent, render } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import LayersPanel from '../../../packages/editor-vue/src/shell/components/LayersPanel.vue'

const layers = ['top', 'bottom'].map((id) => ({
  id,
  icon: 'shape' as const,
  name: id,
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
}))

describe('M05 LayersPanel reorder', () => {
  it('emits one exact reorder target for a native pointer drag', async () => {
    const rendered = render(LayersPanel, {
      props: {
        layers,
        open: true,
        t: (key: string) => key,
      },
    })
    const source = rendered.container.querySelector('[data-layer-id="top"]')!
    const target = rendered.container.querySelector('[data-layer-id="bottom"]')!

    await fireEvent.dragStart(source)
    await fireEvent.drop(target)

    expect(rendered.emitted().reorderTo).toEqual([['top', 'bottom']])
  })
})
