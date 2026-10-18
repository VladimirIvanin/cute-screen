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
import { waitForStableCanvas } from '../canvas-ready'
import { setNumericInput } from '../numeric-input'
import { shapeDocument } from '../shape-toolbar'

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
  it('draws sparse loops at 65% correction on a 2560px document', async () => {
    await browser.setViewport({ width: 1280, height: 900, devicePixelRatio: 1 })
    await openDrawingHarness(true)
    await $('button[aria-label="Pencil"]').click()
    await $('button[aria-label="Brush and width"]').click()
    await setNumericInput($('input[aria-label="Width"]'), '6')
    await browser.keys('Enter')
    await browser.keys('Escape')
    await waitForStableCanvas()
    const bounds = await browser.execute(() => {
      const rect = document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    })
    for (const [column, name] of ['Exact pen', 'Autocorrection'].entries()) {
      await $('button[aria-label="Brush and width"]').click()
      await $(`.cs-brush-choices button[aria-label="${name}"]`).click()
      await browser.keys('Escape')
      await $('.cs-tool-settings-popover').waitForDisplayed({ reverse: true })
      const points = Array.from({ length: 20 }, (_, i) => {
        const angle = i / 19 * Math.PI * 2.1
        const radius = bounds.height * (.035 + i * .006)
        return { x: Math.round(bounds.x + bounds.width * (.3 + column * .4) + Math.cos(angle) * radius),
          y: Math.round(bounds.y + bounds.height * .5 + Math.sin(angle) * radius) }
      })
      const action = browser.action('pointer').move({ origin: 'viewport', ...points[0]! }).down({ button: 'left' })
      for (const point of points.slice(1)) action.move({ origin: 'viewport', ...point, duration: 20 })
      await action.up({ button: 'left' }).perform()
      await browser.waitUntil(async () => (await shapeDocument()).layers.length === 5 + column)
    }
    expect((await shapeDocument()).layers.at(-1)!.payload).toMatchObject({
      brush: 'stabilized', smoothing: .65, width: 6,
    })
    await browser.waitUntil(() => browser.execute(() => document.getAnimations().every((animation) =>
      animation.effect?.getTiming().iterations === Infinity || animation.playState !== 'running')))
    await browser.saveScreenshot('artifacts/browser-e2e/rounded-loops-2560.png')
  })
})
