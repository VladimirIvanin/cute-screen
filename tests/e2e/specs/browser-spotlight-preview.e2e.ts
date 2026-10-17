import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openM08 } from './browser-m08-test-kit'
import { setShellPreferences } from './browser-m06-test-kit'
import { verifySpotlightPreview } from '../spotlight-preview'

describe('spotlight pixels during gestures', () => {
  it('offers direct shape icons in both languages and themes at 1024 px', async () => {
    await browser.setWindowSize(1024, 800)
    await browser.url('/')
    await browser.execute(() => window.localStorage.clear())
    await browser.url('/?m05=1&m05viewport=1')
    await expect($('.cs-canvas-ready')).toExist()
    for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await setShellPreferences(locale, theme)
      await browser.keys('f')
      const group = $('.cs-tool-defaults-toolbar .cs-tool-shapes')
      await expect(group).toBeDisplayed()
      const names = locale === 'ru' ? ['Прямоугольник', 'Эллипс', 'Ромб'] : ['Rectangle', 'Ellipse', 'Diamond']
      for (const name of names) {
        const button = group.$(`button[aria-label="${name}"]`)
        await expect(button).toHaveAttribute('title', name)
        await button.click()
        await expect(button).toHaveAttribute('aria-pressed', 'true')
        await expect(group.$$('button[aria-pressed="true"]')).toBeElementsArrayOfSize(1)
        await expect($('.cs-tool-settings-popover')).not.toExist()
      }
      const rectangle = group.$(`button[aria-label="${names[0]}"]`)
      await rectangle.click()
      await browser.keys('Tab')
      await expect(group.$(`button[aria-label="${names[1]}"]`)).toBeFocused()
      await browser.keys('Space')
      await expect(group.$(`button[aria-label="${names[1]}"]`)).toHaveAttribute('aria-pressed', 'true')
      expect(await browser.execute(() => {
        const panel = document.querySelector('.cs-tool-defaults-toolbar')!.getBoundingClientRect()
        const rail = document.querySelector('.cs-toolrail')!.getBoundingClientRect()
        return panel.left >= 0 && panel.right <= innerWidth && panel.top >= 0 && panel.bottom <= rail.top &&
          [...document.querySelectorAll('.cs-tool-shapes button')].every((button) => {
            const bounds = button.getBoundingClientRect()
            return bounds.width >= 36 && bounds.height >= 36
          })
      })).toBe(true)
      await browser.saveScreenshot(`artifacts/browser-e2e/spotlight-shapes-${locale}-${theme}.png`)
      await browser.keys('Escape')
    }
  }).timeout(120000)
  it('previews creation, movement and aperture cancellation before pointer-up', async () => {
    await browser.setWindowSize(1280, 900)
    await openM08()
    await verifySpotlightPreview('artifacts/browser-e2e/spotlight')
  }).timeout(120000)
})
