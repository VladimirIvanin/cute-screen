import {
  $,
  $$,
  browser,
  expect,
} from '@wdio/globals'
import {
  openDrawingHarness,
  setShellPreferences,
} from './browser-m06-test-kit'
import { verifyBrushes } from '../brushes'

describe('distinct brush drawing', () => {
  it('restores expressive preferences as autocorrection through production mount', async () => {
    await openDrawingHarness()
    await browser.execute(() => {
      localStorage.removeItem('cute-screen.tool-settings.v3')
      localStorage.setItem('cute-screen.drawing-tool-preferences.v1', JSON.stringify({
        schemaVersion: 2, defaults: { pencil: { brush: 'brush', width: 12, smoothing: .2,
          brushSmoothing: { brush: .2, stabilized: .8 } } },
      }))
    })
    await browser.refresh()
    await $('.cs-toolrail button[aria-label="Pencil"]').click()
    await $('button[aria-label="Brush and width"]').click()
    await expect($('.cs-brush-choices button[aria-label="Autocorrection"]')).toHaveAttribute('aria-pressed', 'true')
    expect(await $$('.cs-brush-choices button').length).toBe(2)
    await expect($('.cs-brush-choices button[aria-label="Expressive brush"]')).not.toExist()
    await browser.keys('Escape')
    await $('button[aria-label="Correction"]').click()
    await expect($('input[aria-label="Correction"]')).toHaveValue('80')
    await browser.keys('Escape')
  })
  it('draws two brushes, undoes and cancels, with accessible compact settings', async () => {
    await browser.setWindowSize(1280, 900)
    await openDrawingHarness()
    await verifyBrushes('artifacts/browser-e2e', 'brushes')
    for (const locale of ['ru', 'en'] as const) for (const theme of ['light', 'dark'] as const) {
      await browser.setWindowSize(1024, 800)
      await setShellPreferences(locale, theme)
      await $(`button[aria-label="${locale === 'ru' ? 'Кисть и толщина' : 'Brush and width'}"]`).click()
      const panel = $('.cs-tool-settings-popover')
      await expect(panel).toBeDisplayed()
      const rectangle = await panel.getLocation()
      const size = await panel.getSize()
      expect(rectangle.x).toBeGreaterThanOrEqual(0)
      expect(rectangle.y).toBeGreaterThanOrEqual(0)
      expect(rectangle.x + size.width).toBeLessThanOrEqual(1024)
      await browser.saveScreenshot(`artifacts/browser-e2e/brushes-1024-${locale}-${theme}.png`)
      await browser.keys('Escape')
    }
  })
})
