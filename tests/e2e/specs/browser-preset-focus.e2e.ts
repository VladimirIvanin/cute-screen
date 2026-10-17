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
import { setNumericInput } from '../numeric-input'

describe('unambiguous numeric preset selection', () => {
  it('focuses 4 px and 24 px on reopen and the field for custom values', async () => {
    await browser.setWindowSize(1024, 768)
    await openDrawingHarness(true)
    await verifyRulerToolbar('artifacts/browser-e2e/preset-focus')
    for (const [label, value] of [['Thickness', '4'], ['Label size', '24']]) {
      await $(`button[aria-label="${label}"]`).click()
      await setNumericInput($(`.cs-tool-settings-popover input[aria-label="${label}"]`), value!)
      await browser.keys('Enter')
      await browser.keys('Escape')
    }
    for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await setShellPreferences(locale, theme)
      for (const [label, value] of [[locale === 'ru' ? 'Толщина линии' : 'Thickness', '4'], [locale === 'ru' ? 'Размер подписи' : 'Label size', '24']]) {
        const trigger = $(`button[aria-label="${label}"]`)
        await trigger.click()
        const selected = $(`.cs-tool-settings-popover .cs-numeric-presets button[aria-label="${value} px"][aria-pressed="true"]`)
        await expect(selected).toBeFocused()
        const fit = await browser.execute(() => {
          const panel = document.querySelector('.cs-tool-settings-popover')!.getBoundingClientRect()
          const first = document.querySelector('.cs-tool-settings-popover .cs-numeric-presets button')!
          return panel.left >= 0
            && panel.top >= 0
            && panel.right <= innerWidth
            && panel.bottom <= innerHeight
            && document.activeElement !== first
            && !first.classList.contains('n-button--focus')
        })
        expect(fit).toBe(true)
        await browser.waitUntil(() => browser.execute(() => document.getAnimations().every((animation) =>
          animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running')))
        await browser.saveScreenshot(`artifacts/browser-e2e/preset-focus-${locale}-${theme}-${value}.png`)
        await browser.keys('Escape')
        await expect(trigger).toBeFocused()
        // Keyboard reopening must use the same target as pointer opening.
        await browser.keys('Enter')
        await expect($(`.cs-tool-settings-popover .cs-numeric-presets button[aria-label="${value} px"][aria-pressed="true"]`)).toBeFocused()
        await browser.keys('Escape')
      }
    }
    await setShellPreferences('en', 'light')
    await $('button[aria-label="Thickness"]').click()
    await setNumericInput($('.cs-tool-settings-popover input[aria-label="Thickness"]'), '5')
    await browser.keys('Enter')
    await browser.keys('Escape')
    await $('button[aria-label="Thickness"]').click()
    await expect($('.cs-tool-settings-popover input[aria-label="Thickness"]')).toBeFocused()
    expect(await browser.execute(() => document.querySelectorAll('.cs-tool-settings-popover .cs-numeric-presets [aria-pressed="true"]').length)).toBe(0)
    await browser.saveScreenshot('artifacts/browser-e2e/preset-focus-custom.png')
    await browser.keys('Escape')
  }).timeout(120000)
})
