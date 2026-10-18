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
  lineDefaultsHost,
  lineDocument,
  lineDrag,
  lineOrigin,
  verifyLine,
} from '../line'
import { expectToolTooltip } from '../tool-tooltip'
import { waitForStableCanvas } from '../canvas-ready'

describe('standalone line tool', () => {
  it('creates and edits straight lines with trusted pointer input', async () => {
    await browser.setViewport({ width: 1280, height: 900, devicePixelRatio: 1 })
    await openDrawingHarness(true)
    await verifyLine('artifacts/browser-e2e/line')
    await browser.keys('z')
    await expect($('.cs-toolrail [data-tool-id="loupe"]')).toHaveAttribute('aria-pressed', 'true')
    await browser.keys('l')
    await expect($('.cs-toolrail [data-tool-id="line"]')).toHaveAttribute('aria-pressed', 'true')
  }).timeout(120000)

  it('keeps settings and visible lines usable at 1024px across themes, locales and zoom', async () => {
    await browser.setViewport({ width: 1024, height: 800, devicePixelRatio: 1 })
    await openDrawingHarness(true)
    await $('.cs-toolrail [data-tool-id="line"]').click()
    for (const locale of ['en', 'ru'] as const) for (const theme of ['light', 'dark'] as const) {
      await setShellPreferences(locale, theme)
      for (const tool of ['line', 'loupe']) {
        await $(`.cs-toolrail [data-tool-id="${tool}"]`).moveTo()
        await expectToolTooltip(tool === 'line' ? locale === 'ru' ? 'Линия (L)' : 'Line (L)' : locale === 'ru' ? 'Лупа (Z)' : 'Loupe (Z)')
        await $('.cs-brand').moveTo()
      }
      const origin = await lineOrigin()
      await lineDrag(origin.x, origin.y, 130, 3)
      const host = await lineDefaultsHost()
      const alignment = $(`${host} [data-control="autoAlignAxes"]`)
      await expect(alignment).toHaveText('')
      await expect(alignment.$('svg')).toHaveElementClass(
        await alignment.getAttribute('aria-pressed') === 'true' ? 'tabler-icon-magnet' : 'tabler-icon-magnet-off',
      )
      await $(host).saveScreenshot(`artifacts/browser-e2e/line-compact-${locale}-${theme}.png`)
      await $(`${host} [data-control="stroke"] button`).click()
      await browser.waitUntil(() => browser.execute(() => {
        const rect = document.querySelector('.cs-arrow-toolbar-popover')!.getBoundingClientRect()
        return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
      }))
      await browser.saveScreenshot(`artifacts/browser-e2e/line-1024-${locale}-${theme}.png`)
      await browser.keys('Escape')
    }
    await setShellPreferences('en', 'dark')
    for (const zoom of [50, 100, 200]) {
      await $('.cs-zoom-value').click()
      for (let step = 0; step < Math.abs(zoom - 100) / 10; step++) await $(`button[aria-label="${zoom < 100 ? 'Zoom out' : 'Zoom in'}"]`).click()
      await waitForStableCanvas()
      const before = (await lineDocument()).layers.length
      const point = await lineOrigin()
      await lineDrag(point.x, point.y, 120, 3)
      await browser.waitUntil(async () => (await lineDocument()).layers.length === before + 1)
      await browser.saveScreenshot(`artifacts/browser-e2e/line-zoom-${zoom}.png`)
    }
  }).timeout(180000)
})
