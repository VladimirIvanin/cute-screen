import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyHighlighter } from '../highlighter-toolbar'
import { waitForShapeAnimation } from '../shape-toolbar'

describe('highlighter and simple palettes', () => {
  it('draws a stable screen-blended preview and edits defaults through native input', async () => {
    await browser.setWindowSize(1024, 700)
    await openDrawingHarness()
    await verifyHighlighter('artifacts/browser-e2e', 'highlighter')
    for (const locale of ['en', 'ru'] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await setShellPreferences(locale, theme)
        await $('.cs-highlighter-toolbar button[aria-label="' + (locale === 'ru' ? 'Режим' : 'Effect') + '"]').click()
        await expect($('.cs-highlighter-mode[aria-label="' + (locale === 'ru' ? 'Подсветить' : 'Illuminate') + '"]')).toBeDisplayed()
        await waitForShapeAnimation()
        await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', `highlighter-${locale}-${theme}.png`))
        await browser.keys('Escape')
      }
    }
  })
})
