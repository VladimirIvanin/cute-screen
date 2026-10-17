import {
  browser,
  expect,
} from '@wdio/globals'

/** Measure the rendered lines, including CSS that can override the shared component. */
export async function verifyToolbarSeparators(
  selector: string,
  expectedCount: number,
): Promise<void> {
  const layouts = await browser.execute((hostSelector) => {
    return [...document.querySelectorAll<HTMLElement>(hostSelector)]
      .filter((host) => host.getBoundingClientRect().height > 0)
      .map((host) => {
        const bounds = host.getBoundingClientRect()
        const separators = [...host.querySelectorAll<HTMLElement>(':scope > .cs-ui-separator')]
        return {
          fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
          separators: separators.map((separator) => {
            const rect = separator.getBoundingClientRect()
            const style = getComputedStyle(separator)
            return {
              width: rect.width,
              height: rect.height,
              radius: style.borderRadius,
              centered: Math.abs(rect.top + rect.height / 2 - bounds.top - bounds.height / 2) <= 0.5,
              decorative: separator.getAttribute('aria-hidden') === 'true' && separator.tabIndex === -1 && style.pointerEvents === 'none',
            }
          }),
          buttonBorders: [...host.querySelectorAll<HTMLElement>(':scope > button')].map((button) => {
            const style = getComputedStyle(button)
            return { left: style.borderLeftWidth, right: style.borderRightWidth }
          }),
        }
      })
  }, selector)
  expect(layouts.length).toBeGreaterThan(0)
  for (const layout of layouts) {
    expect(layout.fits).toBe(true)
    expect(layout.separators).toHaveLength(expectedCount)
    for (const separator of layout.separators) {
      expect(separator).toEqual({ width: 1, height: 21, radius: '0px', centered: true, decorative: true })
    }
    for (const border of layout.buttonBorders) {
      expect(border).toEqual({ left: '0px', right: '0px' })
    }
  }
}
