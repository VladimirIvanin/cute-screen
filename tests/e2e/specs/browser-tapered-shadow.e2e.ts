import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import {
  verifyTaperedShadow,
  shadowLayers,
} from '../tapered-shadow'
import { drawShape } from '../shape-toolbar'

describe('tapered arrows and annotation shadows', () => {
  it('creates and edits a tapered arrow with a saved shadow and one-command undo', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness(true)
    await verifyTaperedShadow('artifacts/browser-e2e')
    await drawShape()
    await $('.cs-selection-floating-toolbar .cs-annotation-shadow-trigger').click()
    await $('.cs-annotation-shadow-popup').$('button=Soft').click()
    expect((await shadowLayers()).at(-1)!.annotationShadow).toBe('soft')
    await $('button[aria-label="Undo"]').click()
    expect((await shadowLayers()).at(-1)!.annotationShadow).toBeUndefined()
    await $('button[aria-label="Redo"]').click()
    expect((await shadowLayers()).at(-1)!.annotationShadow).toBe('soft')
  }).timeout(120000)

  it('keeps the shadow popup inside a narrow viewport in both locales and themes', async () => {
    await browser.setWindowSize(1024, 760)
    await openDrawingHarness(true)
    await verifyTaperedShadow('artifacts/browser-e2e')
    for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await setShellPreferences(locale, theme)
      await $('.cs-selection-floating-toolbar .cs-annotation-shadow-trigger').click()
      await $('.cs-annotation-shadow-popup').waitForDisplayed()
      const fits = await browser.execute(() => {
        const b = document.querySelector('.cs-annotation-shadow-popup')!.getBoundingClientRect()
        return b.left >= 0 && b.top >= 0 && b.right <= innerWidth && b.bottom <= innerHeight &&
          document.documentElement.scrollWidth <= innerWidth
      })
      expect(fits).toBe(true)
      await browser.saveScreenshot(`artifacts/browser-e2e/tapered-shadow-${locale}-${theme}.png`)
      await browser.keys('Escape')
    }
  }).timeout(120000)
})
