import { readFileSync } from 'node:fs'
import { render } from '@testing-library/vue'
import {
  describe,
  expect,
  it,
} from 'vitest'
import { UiIcon } from '../../../packages/editor-vue/src/shell/icon'
import type { IconName } from '../../../packages/editor-vue/src/shell/types'

// Read the public semantic union so newly added names also require a working SVG.
const types = readFileSync('packages/editor-vue/src/shell/types.ts', 'utf8')
const union = types.match(/export type IconName\s*=\s*((?:\|\s*'[^']+'\s*)+)/u)?.[1]
if (!union) throw new Error('IconName declaration is missing')
const names = [...union.matchAll(/\| '([A-Za-z]+)'/gu)].map((match) => match[1] as IconName)

const customNames = new Set<IconName>(['marker', 'pencil', 'eyedropper', 'spotlight', 'privacy', 'loupe'])

describe('semantic Tabler and project icons', () => {
  it.each(names)('preserves caller class and style for %s', (name) => {
    const view = render(UiIcon, {
      props: { name },
      attrs: { class: 'cs-layer-lock-idle', style: { color: 'rgb(10, 20, 30)', width: '18px' } },
    })
    const svg = view.container.querySelector('svg')
    expect(svg).toHaveClass('cs-layer-lock-idle')
    expect(svg?.style.color).toBe('rgb(10, 20, 30)')
    expect(svg?.style.width).toBe('18px')
    expect(view.container.querySelectorAll('svg')).toHaveLength(1)
  })

  it.each(names)('renders %s as a decorative currentColor SVG', (name) => {
    const view = render(UiIcon, { props: { name } })
    const svg = view.container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke', 'currentColor')
    expect(svg).toHaveAttribute('stroke-width', '1.8')
    expect(svg).toHaveAttribute('fill', 'none')
    expect(svg).toHaveAttribute('stroke-linecap', 'round')
    expect(svg).toHaveAttribute('stroke-linejoin', 'round')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveAttribute('focusable', 'false')
    expect(svg?.classList.contains('tabler-icon')).toBe(!customNames.has(name))
    expect(svg?.classList.contains('cs-custom-icon')).toBe(customNames.has(name))
    expect(svg?.querySelector('path, circle, rect, line, polyline, polygon, ellipse')).toBeTruthy()
    for (const element of svg?.querySelectorAll('*') ?? []) {
      expect(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']).toContain(element.tagName)
      for (const attribute of element.attributes) {
        expect(['d', 'cx', 'cy', 'r', 'x', 'y', 'width', 'height', 'rx', 'ry', 'x1', 'y1', 'x2', 'y2', 'points', 'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin']).toContain(attribute.name)
        expect(attribute.value).not.toMatch(/url\(|https?:|data:|javascript:/iu)
        if (attribute.name === 'fill' || attribute.name === 'stroke') {
          expect(['none', 'currentColor']).toContain(attribute.value)
        }
        if (attribute.name === 'fill-opacity') {
          expect(element).toHaveAttribute('fill', 'currentColor')
          expect(Number.isFinite(Number(attribute.value))).toBe(true)
          expect(Number(attribute.value)).toBeGreaterThan(0)
          expect(Number(attribute.value)).toBeLessThanOrEqual(1)
        }
      }
      if (element.hasAttribute('d')) expect(element.getAttribute('d')).not.toBe('')
    }
  })
})
