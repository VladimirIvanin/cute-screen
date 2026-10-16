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
  it('draws, adds and edits apertures and exposes ruler measurement', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness()
    await verifyToolSettings('artifacts/browser-e2e', 'tool-settings')
    for (const width of [1024, 1280]) {
      await browser.setWindowSize(width, 800)
      for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        await $(`button[aria-label="${locale === 'ru' ? 'Подпись и единицы' : 'Label and units'}"]`).click()
        await expect($('.cs-tool-settings-popover')).toBeDisplayed()
        await browser.waitUntil(() => browser.execute(() => {
          const panel = document.querySelector('.cs-tool-settings-popover')!.getBoundingClientRect()
          const entry = document.querySelector('.cs-tool-settings-popover .cs-numeric-entry')!.getBoundingClientRect()
          const steps = [...document.querySelectorAll('.cs-tool-settings-popover .cs-numeric-step')]
          return panel.left >= 0 &&
            panel.top >= 0 &&
            panel.right <= innerWidth &&
            panel.bottom <= innerHeight &&
            entry.height === 32 && steps.length === 2 && steps.every((step) => {
            const rect = step.getBoundingClientRect()
            return rect.left >= entry.left &&
              rect.right <= entry.right &&
              rect.top >= entry.top &&
              rect.bottom <= entry.bottom
          })
        }))
        await browser.saveScreenshot(`artifacts/browser-e2e/tool-settings-${width}-${locale}-${theme}.png`)
        await $('.cs-tool-settings-popover').saveScreenshot(`artifacts/browser-e2e/numeric-field-${width}-${locale}-${theme}.png`)
        await browser.keys('Escape')
        await $(`button[aria-label="${locale === 'ru' ? 'Измерение и привязка' : 'Measurement and snapping'}"]`).click()
        await browser.waitUntil(() => browser.execute(() => {
          const panel = document.querySelector('.cs-tool-settings-popover')!.getBoundingClientRect()
          return panel.left >= 0 && panel.top >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight
        }))
        await browser.saveScreenshot(`artifacts/browser-e2e/tool-measurement-${width}-${locale}-${theme}.png`)
        await browser.keys('Escape')
      }
    }
  }).timeout(120000)
})
