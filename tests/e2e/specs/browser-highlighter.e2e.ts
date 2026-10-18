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
import {
  verifyCollapsedHighlighterEffects,
  verifyHighlighter,
} from '../highlighter-toolbar'
import { waitForShapeAnimation } from '../shape-toolbar'
import { verifyToolbarSeparators } from '../toolbar-separators'

describe('highlighter and simple palettes', () => {
  it('draws a stable screen-blended preview and edits defaults through native input', async () => {
    await browser.setWindowSize(1024, 700)
    await openDrawingHarness()
    await verifyHighlighter('artifacts/browser-e2e', 'highlighter')
  })
  it('keeps straight separators in both languages, themes and desktop sizes', async () => {
    await openDrawingHarness()
    await $('button[aria-label="Highlighter"]').click()
    for (const width of [1024, 1280]) {
      await browser.setWindowSize(width, 800)
      for (const locale of ['en', 'ru'] as const) {
        for (const theme of ['light', 'dark'] as const) {
          await setShellPreferences(locale, theme)
          await verifyCollapsedHighlighterEffects('artifacts/browser-e2e', `highlighter-${width}-${locale}-${theme}`, locale)
          await $('.cs-highlighter-toolbar button[aria-label="' + (locale === 'ru' ? 'Режим' : 'Effect') + '"]').click()
          await expect($('.cs-highlighter-mode[aria-label="' + (locale === 'ru' ? 'Подсветить' : 'Illuminate') + '"]')).toBeDisplayed()
          await waitForShapeAnimation()
          await verifyToolbarSeparators('.cs-highlighter-toolbar', 2)
          await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', `highlighter-${width}-${locale}-${theme}.png`))
          await browser.keys('Escape')
          await $('.cs-highlighter-toolbar .cs-simple-color-trigger').click()
          await waitForShapeAnimation()
          await browser.saveScreenshot(path.resolve('artifacts/browser-e2e', `palette-${width}-${locale}-${theme}.png`))
          await browser.keys('Escape')
        }
      }
    }
  }).timeout(300000)
})
