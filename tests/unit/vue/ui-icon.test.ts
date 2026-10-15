import { readFileSync } from 'node:fs'
import { render } from '@testing-library/vue'
import { describe, expect, it } from 'vitest'
import { UiIcon } from '../../../packages/editor-vue/src/shell/icon'
import type { IconName } from '../../../packages/editor-vue/src/shell/types'

// Read the public semantic union so newly added names also require a working SVG.
const types = readFileSync('packages/editor-vue/src/shell/types.ts', 'utf8')
const union = types.match(
  /export type IconName =([\s\S]*?)\n\nexport const/u,
)?.[1]
if (!union) throw new Error('IconName declaration is missing')
const names = [...union.matchAll(/\| '([A-Za-z]+)'/gu)].map(
  (match) => match[1] as IconName,
)

describe('semantic Tabler icons', () => {
  it('preserves caller classes used by layer hover and focus states', () => {
    const view = render(UiIcon, {
      props: { name: 'unlock' },
      attrs: { class: 'cs-layer-lock-idle' },
    })
    expect(view.container.querySelector('svg')).toHaveClass(
      'cs-layer-lock-idle',
    )
  })

  it.each(names)('renders %s as a decorative currentColor SVG', (name) => {
    const view = render(UiIcon, { props: { name } })
    const svg = view.container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('stroke-width', '1.8')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg?.classList.contains('tabler-icon')).toBe(true)
    expect(
      svg?.querySelector(
        'path, circle, rect, line, polyline, polygon, ellipse',
      ),
    ).toBeTruthy()
    expect(svg?.querySelector('image, use')).toBeNull()
  })
})
