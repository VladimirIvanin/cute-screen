import { fireEvent, render } from '@testing-library/vue'
import { describe, expect, it, vi } from 'vitest'

import LayersPanel from '../../../packages/editor-vue/src/shell/components/LayersPanel.vue'

const layers = ['top', 'middle', 'bottom'].map((id) => ({
  id,
  icon: 'shape' as const,
  name: id,
  visible: true,
  locked: false,
  opacity: 1,
  rotation: 0,
  opacityEditable: true,
}))

async function pointerReorder(
  source: Element,
  target: Element,
  place: 'before' | 'after',
): Promise<void> {
  const rect = target.getBoundingClientRect()
  const clientY = place === 'before' ? rect.top + 4 : rect.bottom - 4
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({
    top: rect.top || 100,
    left: rect.left || 0,
    right: rect.right || 200,
    bottom: rect.bottom || 140,
    width: rect.width || 200,
    height: rect.height || 40,
    x: rect.x || 0,
    y: rect.y || 100,
    toJSON: () => ({}),
  } as DOMRect)
  const elementFromPoint = vi.fn(() => target)
  vi.stubGlobal(
    'elementFromPoint',
    elementFromPoint as typeof document.elementFromPoint,
  )
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: elementFromPoint,
  })

  source.dispatchEvent(
    new PointerEvent('pointerdown', {
      bubbles: true,
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      button: 0,
    }),
  )
  source.dispatchEvent(
    new PointerEvent('pointermove', {
      bubbles: true,
      pointerId: 1,
      clientX: 10,
      clientY,
      button: 0,
    }),
  )
  source.dispatchEvent(
    new PointerEvent('pointerup', {
      bubbles: true,
      pointerId: 1,
      clientX: 10,
      clientY,
      button: 0,
    }),
  )
}

describe('M05 LayersPanel reorder', () => {
  it('emits reorder target with before/after placement for pointer drag', async () => {
    const rendered = render(LayersPanel, {
      props: {
        layers,
        open: true,
        t: (key: string) => key,
      },
    })
    const source = rendered.container.querySelector(
      '[data-layer-id="top"] .cs-layer-select',
    )!
    const target = rendered.container.querySelector('[data-layer-id="bottom"]')!

    await pointerReorder(source, target, 'before')
    expect(rendered.emitted().reorderTo).toEqual([['top', 'bottom', 'before']])

    await pointerReorder(source, target, 'after')
    expect(rendered.emitted().reorderTo?.[1]).toEqual([
      'top',
      'bottom',
      'after',
    ])
  })

  it('selects on tap and ignores visibility control for reorder', async () => {
    const rendered = render(LayersPanel, {
      props: {
        layers,
        open: true,
        t: (key: string) => key,
      },
    })
    const row = rendered.container.querySelector('[data-layer-id="top"]')!
    const name = rendered.container.querySelector(
      '[data-layer-id="top"] .cs-layer-select',
    )!
    const eye = row.querySelector('.cs-layer-action')!
    const target = rendered.container.querySelector('[data-layer-id="bottom"]')!

    name.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 2,
        clientX: 10,
        clientY: 10,
        button: 0,
      }),
    )
    name.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 2,
        clientX: 10,
        clientY: 10,
        button: 0,
      }),
    )
    expect(rendered.emitted().select).toEqual([['top', false, false]])

    const elementFromPoint = vi.fn(() => target)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    })
    eye.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerId: 3,
        clientX: 10,
        clientY: 10,
        button: 0,
      }),
    )
    eye.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        pointerId: 3,
        clientX: 10,
        clientY: 120,
        button: 0,
      }),
    )
    eye.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        pointerId: 3,
        clientX: 10,
        clientY: 120,
        button: 0,
      }),
    )
    expect(rendered.emitted().reorderTo).toBeUndefined()
  })

  it('does not render move up/down buttons', () => {
    const rendered = render(LayersPanel, {
      props: {
        layers,
        open: true,
        t: (key: string) => key,
      },
    })

    expect(rendered.container.querySelector('.cs-layer-order')).toBeNull()
    expect(rendered.queryByLabelText('moveLayerUp')).toBeNull()
    expect(rendered.queryByLabelText('moveLayerDown')).toBeNull()
  })

  it('renders header opacity/rotation for the selected layer', async () => {
    const rendered = render(LayersPanel, {
      props: {
        layers,
        open: true,
        selectedLayerId: 'middle',
        t: (key: string) => key,
      },
    })

    expect(
      rendered.container.querySelector('.cs-layers-controls'),
    ).not.toBeNull()
    expect(rendered.container.querySelector('.cs-layer-properties')).toBeNull()
    expect(
      await rendered.findByRole('slider', { name: 'opacity' }),
    ).toBeInTheDocument()
    const rotationInput = rendered.container.querySelector(
      '.cs-layers-controls .cs-ui-number-input input',
    ) as HTMLInputElement
    expect(rotationInput).not.toBeNull()
    await fireEvent.update(rotationInput, '45')
    await fireEvent.blur(rotationInput)
    expect(rendered.emitted().rotation).toEqual([['middle', 45]])
  })
})
