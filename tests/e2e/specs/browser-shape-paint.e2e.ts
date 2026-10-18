import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyShapePaint } from '../shape-paint'
import { waitForShapeAnimation } from '../shape-toolbar'

describe('shape gradient and stroke controls', () => {
  it('edits multi-stop gradients and shows compact controls in every locale/theme', async () => {
    await browser.setWindowSize(1024, 800)
    await openDrawingHarness()
    await verifyShapePaint('artifacts/browser-e2e/shape-paint')
    for (const width of [1024, 1280]) for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await browser.setWindowSize(width, 800)
      await setShellPreferences(locale, theme)
      await $('.cs-selection-floating-toolbar [data-shape-control="fill"]').click()
      await waitForShapeAnimation()
      expect(await browser.execute(() => {
        const bounds = document.querySelector('.cs-shape-popover')!.getBoundingClientRect()
        return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight
      })).toBe(true)
      await browser.saveScreenshot(`artifacts/browser-e2e/shape-paint-${width}-${locale}-${theme}.png`)
      await browser.keys('Escape')
    }
    await setShellPreferences('en', 'dark')
    for (const zoom of [50, 100, 200]) {
      await $('.cs-zoom-value').click()
      const control = $(`button[aria-label="${zoom < 100 ? 'Zoom out' : 'Zoom in'}"]`)
      for (let step = 0; step < Math.abs(zoom - 100) / 10; step++) await control.click()
      await expect($('.cs-zoom-controls')).toHaveAttribute('data-zoom', String(zoom))
      await $('.cs-selection-floating-toolbar [data-shape-control="fill"]').click()
      await waitForShapeAnimation()
      expect(await browser.execute(() => {
        const bounds = document.querySelector('.cs-shape-popover')!.getBoundingClientRect()
        return bounds.left >= 0 && bounds.top >= 0 && bounds.right <= innerWidth && bounds.bottom <= innerHeight
      })).toBe(true)
      await browser.saveScreenshot(`artifacts/browser-e2e/shape-paint-zoom-${zoom}.png`)
      await browser.keys('Escape')
    }
  }).timeout(180000)
})
