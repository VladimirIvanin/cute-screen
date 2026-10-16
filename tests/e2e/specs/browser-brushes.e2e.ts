import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyBrushes } from '../brushes'

describe('distinct brush drawing', () => {
  it('draws three brushes, undoes and cancels, with accessible compact settings', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness()
    await verifyBrushes('artifacts/browser-e2e', 'brushes')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
      await browser.setWindowSize(1024, 800)
      await setShellPreferences(locale, theme)
      await $(`button[aria-label="${locale === 'ru' ? 'Кисть и толщина' : 'Brush and width'}"]`).click()
      const panel = $('.cs-tool-settings-popover')
      await expect(panel).toBeDisplayed()
      const rectangle = await panel.getLocation()
      const size = await panel.getSize()
      expect(rectangle.x).toBeGreaterThanOrEqual(0)
      expect(rectangle.y).toBeGreaterThanOrEqual(0)
      expect(rectangle.x + size.width).toBeLessThanOrEqual(1024)
      await browser.saveScreenshot(`artifacts/browser-e2e/brushes-1024-${locale}-${theme}.png`)
      await browser.keys('Escape')
    }
  })
})
