import { fireEvent, render, screen, within } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'

import ArrowFormattingToolbar from '../../../packages/editor-vue/src/shell/components/ArrowFormattingToolbar.vue'
import type { ContextControl } from '../../../packages/editor-vue/src/shell/types'

const arrowControls = [
  {
    kind: 'color',
    id: 'color',
    label: 'Color',
    value: '#e5484d',
    compact: true,
  },
  {
    kind: 'arrowStroke',
    id: 'stroke',
    label: 'Stroke',
    width: 3,
    style: 'dashed',
    solidLabel: 'Solid',
    dashedLabel: 'Dashed',
  },
  {
    kind: 'arrowCap',
    id: 'startCap',
    label: 'Tail',
    value: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'lineArrow', label: 'Line arrow' },
      { value: 'solidArrow', label: 'Solid arrow' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'circle', label: 'Circle' },
      { value: 'diamond', label: 'Diamond' },
    ],
  },
  {
    kind: 'arrowPath',
    id: 'arrowPath',
    label: 'Geometry',
    value: 'elbow',
    options: [
      { value: 'straight', label: 'Straight' },
      { value: 'elbow', label: 'Elbow' },
      { value: 'quadratic', label: 'Curved' },
    ],
  },
  {
    kind: 'arrowCap',
    id: 'endCap',
    label: 'Head',
    value: 'solidArrow',
    options: [
      { value: 'none', label: 'None' },
      { value: 'lineArrow', label: 'Line arrow' },
      { value: 'solidArrow', label: 'Solid arrow' },
      { value: 'triangle', label: 'Triangle' },
      { value: 'circle', label: 'Circle' },
      { value: 'diamond', label: 'Diamond' },
    ],
  },
] as unknown as ContextControl[]

describe('arrow contextual toolbar', () => {
  it('renders exactly five compact arrow controls in FigJam order', () => {
    const { container } = render(ArrowFormattingToolbar, {
      props: { controls: arrowControls, variant: 'floating' },
    })

    const controls = container.querySelectorAll('.cs-arrow-toolbar-control')
    expect(controls).toHaveLength(5)
    expect(
      [...controls].map((control) => control.getAttribute('data-control')),
    ).toEqual(['color', 'stroke', 'startCap', 'arrowPath', 'endCap'])
    expect(screen.queryByText('Opacity')).not.toBeInTheDocument()
    expect(screen.queryByText('Blend')).not.toBeInTheDocument()
    expect(screen.queryByText('Text')).not.toBeInTheDocument()
  })

  it('shows a legacy non-preset width without offering numeric input', async () => {
    render(ArrowFormattingToolbar, {
      props: { controls: arrowControls, variant: 'floating' },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Stroke: 3 px' }))
    const dialog = await screen.findByRole('dialog', { name: 'Stroke' })
    expect(within(dialog).getByText('3 px')).toBeInTheDocument()
    expect(within(dialog).queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('closes a popover on Escape and returns focus to its trigger', async () => {
    render(ArrowFormattingToolbar, {
      props: { controls: arrowControls, variant: 'floating' },
    })

    const trigger = screen.getByRole('button', { name: 'Geometry: Elbow' })
    trigger.focus()
    await fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Geometry' })
    await fireEvent.keyDown(dialog, { key: 'Escape' })

    expect(
      screen.queryByRole('dialog', { name: 'Geometry' }),
    ).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('closes a popover after an outside click', async () => {
    render(ArrowFormattingToolbar, {
      props: { controls: arrowControls, variant: 'floating' },
    })

    await fireEvent.click(screen.getByRole('button', { name: 'Tail: None' }))
    expect(
      await screen.findByRole('dialog', { name: 'Tail' }),
    ).toBeInTheDocument()
    await fireEvent.pointerDown(document.body)

    expect(
      screen.queryByRole('dialog', { name: 'Tail' }),
    ).not.toBeInTheDocument()
  })

  it('emits a cap choice from a keyboard-accessible popover', async () => {
    const view = render(ArrowFormattingToolbar, {
      props: { controls: arrowControls, variant: 'floating' },
    })

    const trigger = screen.getByRole('button', { name: 'Head: Solid arrow' })
    await fireEvent.keyDown(trigger, { key: 'Enter' })
    await fireEvent.click(
      await screen.findByRole('button', { name: 'Diamond' }),
    )

    expect(view.emitted('change')).toEqual([['endCap', 'diamond']])
    expect(trigger).toHaveFocus()
  })
})
