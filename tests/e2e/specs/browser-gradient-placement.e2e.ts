import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'
import { gradientDocument } from '../gradient'
import { setEditorPreferences } from '../editor-settings'

async function createBackdrop(): Promise<void> {
  await openDrawingHarness(true)
  await $('.cs-toolrail [data-tool-id="gradient"]').click()
  const rect = await browser.execute(() => document.querySelector('.cs-canvas:not(.cs-canvas-overlay)')!.getBoundingClientRect().toJSON())
  await browser.action('pointer')
    .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * .2), y: Math.round(rect.top + rect.height * .3) })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(rect.left + rect.width * .75), y: Math.round(rect.top + rect.height * .8), duration: 180 })
    .up({ button: 'left' }).perform()
  await expect($('.cs-selection-floating-toolbar .cs-gradient-toolbar')).toBeDisplayed()
}
async function checkPanelLayout(): Promise<void> {
  const measurements = await browser.execute(() => {
    const toolbar = document.querySelector('.cs-selection-floating-toolbar .cs-gradient-toolbar')!
    const panel = toolbar.getBoundingClientRect()
    const controls = [...toolbar.children].map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 && rect.height > 0)
    const overlaps = controls.some((a, i) => controls.some((b, j) => i < j &&
      Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1))
    const label = toolbar.querySelector('.cs-numeric-label')!.getBoundingClientRect()
    const field = toolbar.querySelector('.cs-numeric-entry')!.getBoundingClientRect()
    return { overlaps, fieldAlignment: Math.abs(label.top + label.height / 2 - field.top - field.height / 2),
      outside: controls.some((rect) => rect.left < panel.left - 1 || rect.right > panel.right + 1),
      inViewport: panel.left >= 0 && panel.right <= window.innerWidth, height: panel.height }
  })
  expect(measurements).toMatchObject({ overlaps: false, outside: false, inViewport: true })
  expect(measurements.fieldAlignment).toBeLessThan(3)
  expect(measurements.height).toBeLessThanOrEqual(72)
}
describe('gradient graphical placement', () => {
  it('aligns to all edges and centers, stretches and undoes each command through the popup', async () => {
    await browser.setWindowSize(1024, 768)
    await createBackdrop()
    await $('.cs-gradient-placement-trigger').click()
    for (const action of ['Left', 'CenterX', 'Right', 'Top', 'CenterY', 'Bottom', 'Width', 'Height']) {
      const before = (await gradientDocument()).layers.at(-1)!
      const id = `gradient${['Width', 'Height'].includes(action) ? 'Fit' : 'Align'}${action}`
      const control = $(`[data-gradient-placement="${id}"]`)
      await control.click()
      await expect(control).toHaveAttribute('aria-pressed', 'true')
      const document = await gradientDocument()
      const frame = document.crop ?? { x: 0, y: 0, ...document.canvas }
      const after = document.layers.at(-1)!
      const expectedX = action === 'Left' ? frame.x : action === 'CenterX'
        ? frame.x + (frame.width - before.localBounds.width) / 2 : frame.x + frame.width - before.localBounds.width
      const expectedY = action === 'Top' ? frame.y : action === 'CenterY'
        ? frame.y + (frame.height - before.localBounds.height) / 2 : frame.y + frame.height - before.localBounds.height
      if (['Left', 'CenterX', 'Right'].includes(action)) expect(after.transform.translateX).toBeCloseTo(expectedX)
      if (['Top', 'CenterY', 'Bottom'].includes(action)) expect(after.transform.translateY).toBeCloseTo(expectedY)
      if (action === 'Width') expect(after.localBounds.width).toBe(frame.width)
      else if (action === 'Height') expect(after.localBounds.height).toBe(frame.height)
      else expect(after.localBounds).toEqual(before.localBounds)
      expect(after.payload).toEqual(before.payload)
      await control.click() // An already applied placement must not add history.
      await browser.keys(['Control', 'z'])
      await browser.waitUntil(async () =>
        JSON.stringify((await gradientDocument()).layers.at(-1)!) === JSON.stringify(before))
      await browser.keys(['Control', 'Shift', 'z'])
      await browser.waitUntil(async () =>
        JSON.stringify((await gradientDocument()).layers.at(-1)!) === JSON.stringify(after))
    }
    await browser.saveScreenshot('artifacts/browser-e2e/gradient-placement.png')
    await browser.keys('Escape')
    await expect($('.cs-gradient-placement-trigger')).toBeFocused()
  }).timeout(180000)

  it('keeps controls aligned in RU/EN, both themes and narrow windows', async () => {
    await browser.setWindowSize(1024, 768)
    await createBackdrop()
    for (const width of [1024, 640]) {
      await browser.setWindowSize(width, 768)
      for (const locale of ['ru', 'en'] as const) for (const theme of ['dark', 'light'] as const) {
        await setEditorPreferences(locale, theme)
        await checkPanelLayout()
        await $('.cs-gradient-placement-trigger').click()
        await expect($('.cs-gradient-placement')).toBeDisplayed()
        const rect = await $('.cs-gradient-placement').getSize()
        expect(rect.width).toBeLessThan(width)
        await browser.saveScreenshot(`artifacts/browser-e2e/gradient-placement-${width}-${locale}-${theme}.png`)
        await browser.keys('Escape')
      }
    }
  }).timeout(180000)
})
