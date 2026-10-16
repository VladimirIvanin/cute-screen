import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyLoupeSettings } from '../loupe-settings'

describe('compact loupe settings', () => {
  it('creates and edits a loupe with compact controls and visible preview', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness()
    await verifyLoupeSettings('artifacts/browser-e2e/loupe-settings')
    for (const width of [1024, 1280]) {
      await browser.setWindowSize(width, 800)
      for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        for (const menu of ['loupeZoom', 'loupeSize', 'loupeShape', 'loupeBorderWidth']) {
          await $(`[data-loupe-control="${menu}"]`).click()
          await expect($('.cs-loupe-popover')).toBeDisplayed()
          await browser.waitUntil(() => browser.execute(() => {
            const panel = document.querySelector('.cs-loupe-popover')!.getBoundingClientRect()
            const toolbar = document.querySelector('.cs-loupe-toolbar')!.getBoundingClientRect()
            const content = document.querySelector('.cs-loupe-popover')!
            return panel.left >= 0 &&
              panel.top >= 0 &&
              panel.right <= innerWidth &&
              panel.bottom <= innerHeight &&
              toolbar.height <= 40 &&
              toolbar.width < 360 &&
              content.scrollWidth <= content.clientWidth
          }))
          await browser.saveScreenshot(`artifacts/browser-e2e/loupe-${width}-${locale}-${theme}-${menu}.png`)
          await browser.keys('Escape')
        }
      }
    }
  }).timeout(120000)
})
