import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { selectionDocument } from './selection-interactions'
import { waitForStableCanvas } from './canvas-ready'

/** Creates the regression object using normal pointer input in the mounted editor. */
export async function verifySelectionToolbarChrome(
  output: string,
  locale: 'en' | 'ru' = 'en',
): Promise<void> {
  await $(`.cs-toolrail button[aria-label="${locale === 'ru' ? 'Стрелка' : 'Arrow'}"]`).click()
  await waitForStableCanvas()
  const area = await browser.execute(() => {
    const canvas = document.querySelector('.cs-canvas-surface')!.getBoundingClientRect()
    const header = document.querySelector('.cs-topbar')!.getBoundingClientRect()
    return {
      x: Math.round(Math.max(180, canvas.left + 40)),
      y: Math.round(Math.max(header.bottom + 24, canvas.top + 10)),
    }
  })
  const count = (await selectionDocument()).layers.length
  await browser.action('pointer').move({ origin: 'viewport', x: area.x, y: area.y }).down({ button: 'left' })
    .move({ origin: 'viewport', x: area.x + 210, y: area.y + 220, duration: 160 })
    .up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await selectionDocument()).layers.length === count + 1)
  const toolbar = $('.cs-selection-floating-toolbar')
  await expect(toolbar).toBeDisplayed()
  const clearChrome = async (selector: string) => browser.execute((target) => {
    const panel = document.querySelector(target)!.getBoundingClientRect()
    const header = document.querySelector('.cs-topbar')!.getBoundingClientRect()
    const dock = document.querySelector('.cs-bottom-chrome')!.getBoundingClientRect()
    return panel.top >= header.bottom + 8 && panel.bottom <= dock.top - 8
  }, selector)
  await browser.waitUntil(() => clearChrome('.cs-selection-floating-toolbar'))
  // The old above-object placement intersected the top actions in this geometry.
  expect(await browser.execute(() => {
    const toolbar = document.querySelector<HTMLElement>('.cs-selection-floating-toolbar')!
    const objectTop = Number(toolbar.dataset.previewBounds!.split(',')[1])
    const header = document.querySelector('.cs-topbar')!.getBoundingClientRect()
    return objectTop - toolbar.offsetHeight - 10 < header.bottom
  })).toBe(true)
  await browser.saveScreenshot(`${output}-selection.png`)
  const committed = await selectionDocument()
  const stroke = toolbar.$('[data-control="stroke"] .cs-arrow-toolbar-trigger')
  await stroke.click()
  await expect($('.cs-arrow-toolbar-popover')).toBeDisplayed()
  await browser.waitUntil(() => clearChrome('.cs-arrow-toolbar-popover'))
  await browser.saveScreenshot(`${output}-popover.png`)
  await browser.keys('Escape')
  await expect($('.cs-arrow-toolbar-popover')).not.toBeDisplayed()
  expect(await stroke.isFocused()).toBe(true)
  expect(await selectionDocument()).toEqual(committed)
}
