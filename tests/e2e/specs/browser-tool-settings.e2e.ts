import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyToolSettings } from '../tool-settings'

describe('pencil spotlight ruler compact settings', () => {
  it('draws, adds and edits apertures and exposes ruler measurement', async function () {
    this.timeout(120000)
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness()
    await verifyToolSettings('artifacts/browser-e2e', 'tool-settings')
    for (const width of [1024, 1280]) {
      await browser.setWindowSize(width, 800)
      for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        await $(`button[aria-label="${locale === 'ru' ? 'Измерение и привязка' : 'Measurement and snapping'}"]`).click()
        await expect($('.cs-tool-settings-popover')).toBeDisplayed()
        await browser.waitUntil(() => browser.execute(() => {
          const panel = document.querySelector('.cs-tool-settings-popover')!.getBoundingClientRect()
          return panel.left >= 0 && panel.top >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight
        }))
        await browser.saveScreenshot(`artifacts/browser-e2e/tool-settings-${width}-${locale}-${theme}.png`)
        await browser.keys('Escape')
      }
    }
  })
})
