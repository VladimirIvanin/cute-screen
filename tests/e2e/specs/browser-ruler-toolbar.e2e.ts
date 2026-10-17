import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyRulerToolbar } from '../ruler-toolbar'

describe('understandable ruler toolbar', () => {
  it('draws and changes all bases with crop and atomic history', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await verifyRulerToolbar('artifacts/browser-e2e/ruler-ux', true)
  }).timeout(120000)

  it('keeps value and percent basis fully visible in RU/EN light/dark at 1024px', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true)
    await verifyRulerToolbar('artifacts/browser-e2e/ruler-ux-1024')
    for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await setShellPreferences(locale, theme)
      const measure = $('.cs-ruler-measure-trigger')
      await measure.click()
      await $('[data-ruler-mode="canvasDiagonal"]').click()
      await browser.saveScreenshot(`artifacts/browser-e2e/ruler-ux-${locale}-${theme}-menu.png`)
      await browser.keys('Escape')
      await expect(measure).toHaveText(expect.stringContaining(locale === 'ru' ? '% диагонали' : '% of diagonal'))
      const fit = await browser.execute(() => {
        const toolbar = document.querySelector('.cs-selection-floating-toolbar')!.getBoundingClientRect()
        const items = [...document.querySelectorAll('.cs-tool-formatting-toolbar[data-tool-settings="ruler"] > button')]
        return toolbar.left >= 0 && toolbar.right <= innerWidth && items.every((item) => {
          const rect = item.getBoundingClientRect()
          return Math.abs(rect.top - items[0]!.getBoundingClientRect().top) < 2 && item.scrollWidth <= item.clientWidth
        })
      })
      expect(fit).toBe(true)
      await browser.saveScreenshot(`artifacts/browser-e2e/ruler-ux-${locale}-${theme}-closed.png`)
      await $('.cs-selection-floating-toolbar').saveScreenshot(`artifacts/browser-e2e/ruler-ux-${locale}-${theme}-toolbar.png`)
    }
  }).timeout(120000)
})
