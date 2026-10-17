import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import {
  setShellPreferences,
} from './browser-m06-test-kit'
import { waitForStableCanvas } from '../canvas-ready'

describe('creation settings policy', () => {
  it('shows compact defaults on activation at 1024 px in both languages and themes', async () => {
    await browser.setWindowSize(1024, 800)
    await browser.url('/')
    await browser.execute(() => window.localStorage.clear())
    await browser.url('/?m05=1&m05viewport=1')
    await expect($('.cs-canvas-ready')).toExist()
    await waitForStableCanvas()
    for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await setShellPreferences(locale, theme)
      const ids = ['arrow', 'shape', 'pencil', 'marker', 'numberedMarker', 'censor', 'spotlight', 'ruler', 'loupe'] as const
      for (const id of ids) {
        await browser.keys({ arrow: 'a', shape: 's', pencil: 'p', marker: 'm', numberedMarker: 'n', censor: 'b', spotlight: 'f', ruler: 'r', loupe: 'l' }[id]!)
        await expect($('.cs-tool-defaults-toolbar')).toBeDisplayed()
        await expect($('.cs-tool-configure-popover-host')).not.toExist()
        const fits = await browser.execute(() => {
          const panel = document.querySelector('.cs-tool-defaults-toolbar')!.getBoundingClientRect()
          const rail = document.querySelector('.cs-toolrail')!.getBoundingClientRect()
          return panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= rail.top
        })
        expect(fits).toBe(true)
        if (id === 'spotlight') {
          const softness = locale === 'ru' ? 'Мягкость краёв' : 'Edge softness'
          await expect($(`.cs-tool-defaults-toolbar button[aria-label="${softness}"]`)).toHaveText(locale === 'ru' ? 'Чётко' : 'Sharp')
        }
        if (
          id === 'pencil' ||
          id === 'numberedMarker' ||
          id === 'spotlight'
        ) {
          await browser.saveScreenshot(`artifacts/browser-e2e/creation-settings-${id}-${locale}-${theme}.png`)
        }
      }
      await browser.saveScreenshot(`artifacts/browser-e2e/creation-settings-${locale}-${theme}.png`)
      await $('.cs-toolrail button[aria-label="Text"], .cs-toolrail button[aria-label="Текст"]').click()
      await expect($('.cs-tool-defaults-toolbar')).not.toExist()
      await $('.cs-toolrail button[aria-label="Text"], .cs-toolrail button[aria-label="Текст"]').moveTo()
      await browser.waitUntil(async () => (await $('.n-tooltip').getText()).includes('(T)'))
      const tooltip = await $('.n-tooltip').getText()
      expect(tooltip).toBe(locale === 'en' ? 'Text (T)' : 'Текст (T)')
      await $('.cs-canvas:not(.cs-canvas-overlay)').click({ x: -100, y: 30 })
      await expect($('.cs-text-floating-toolbar-host')).toBeDisplayed()
      await expect($('.cs-tool-defaults-toolbar')).not.toExist()
      await browser.keys('Escape')
    }
  }).timeout(120000)
})
