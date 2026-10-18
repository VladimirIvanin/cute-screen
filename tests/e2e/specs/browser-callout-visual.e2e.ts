import { setEditorPreferences } from '../editor-settings'
import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import path from 'node:path'
import { waitForStableCanvas } from '../canvas-ready'
import { openHarness } from './browser-v7-rich-text-test-kit'
import { setLocale } from './browser-m08-test-kit'

describe('Callout desktop layouts', () => {
  it('keeps editing and width controls reachable at 1024 px in RU/EN, both themes and three zooms', async () => {
    await browser.setWindowSize(1024, 700)
    await openHarness()
    await browser.url('/?m05=1&m05viewport=1')
    await expect($('.cs-canvas-ready')).toExist()
    for (const locale of ['en', 'ru'] as const) {
      await setLocale(locale)
      for (const theme of ['light', 'dark'] as const) {
        await setEditorPreferences(locale, theme)
        for (const zoom of [50, 100, 200]) {
          await $('.cs-zoom-value').click()
          const adjustment = zoom < 100 ? '.cs-zoom-controls button:first-child' : '.cs-zoom-controls button:last-child'
          for (let step = 0; step < Math.abs(zoom - 100) / 10; step += 1) await $(adjustment).click()
          await $(`button[aria-label="${locale === 'ru' ? 'Выноска' : 'Callout'}"]`).click()
          await waitForStableCanvas()
          await browser.action('pointer').move({ origin: 'viewport', x: 700, y: 430 }).down({ button: 'left' })
            .move({ origin: 'viewport', x: 450, y: 280, duration: 100 }).up({ button: 'left' }).perform()
          const editor = $('[aria-label="Callout editor"]')
          await expect(editor).toExist()
          await browser.keys(locale === 'ru' ? 'Подпись' : 'Label')
          await expect($('.cs-callout-width-control input')).not.toExist()
          await $('.cs-callout-width-control > button').click()
          await expect($('.cs-callout-width-popover')).toBeDisplayed()
          const layout = await browser.execute(() => {
            const panel = document.querySelector<HTMLElement>('.cs-callout-width-popover')!.getBoundingClientRect()
            const toolbar = document.querySelector<HTMLElement>('.cs-text-floating-toolbar-host')!.getBoundingClientRect()
            const editor = document.querySelector<HTMLElement>('[aria-label="Callout editor"]')!.getBoundingClientRect()
            return [panel, toolbar].every((r) => (
              r.left >= 0 &&
              r.top >= 0 &&
              r.right <= window.innerWidth &&
              r.bottom <= window.innerHeight
            )) && (
              panel.right <= editor.left ||
              panel.left >= editor.right ||
              panel.bottom <= editor.top ||
              panel.top >= editor.bottom
            )
          })
          expect(layout).toBe(true)
          await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/callout-${locale}-${theme}-${zoom}.png`))
          await browser.keys('Escape')
          await editor.click()
          await browser.keys(['Control', 'Enter'])
          await expect(editor).not.toExist()
          const toolbar = $('.cs-callout-toolbar')
          await expect(toolbar).toBeDisplayed()
          const compact = await browser.execute(() => {
            const toolbar = document.querySelector<HTMLElement>('.cs-callout-toolbar')!
            const r = toolbar.getBoundingClientRect()
            const buttons = [...toolbar.querySelectorAll('button')].map((button) => button.getBoundingClientRect())
            return r.width < 420 && r.left >= 0 && r.right <= window.innerWidth &&
              buttons.length === 5 && buttons.every((button) => Math.abs(button.top - buttons[0]!.top) < 1)
          })
          expect(compact).toBe(true)
          await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/callout-icons-${locale}-${theme}-${zoom}.png`))
          await toolbar.$('button').click()
          await expect($('.cs-callout-popover')).toBeDisplayed()
          await browser.saveScreenshot(path.resolve(`artifacts/browser-e2e/callout-route-${locale}-${theme}-${zoom}.png`))
          await browser.keys('Escape')
          await expect(toolbar.$('button')).toBeFocused()
          await browser.keys('Escape')
        }
      }
    }
  }).timeout(180_000)
})
