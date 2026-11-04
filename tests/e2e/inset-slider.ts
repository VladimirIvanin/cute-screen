import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import type { CompositionSettings } from '../../packages/editor-core/src/composition/types'

export async function verifyInsetSlider(
  snapshot: () => Promise<CompositionSettings | undefined>,
  directory: string,
): Promise<void> {
  await $('.cs-composition-panel [data-composition-section="layout"]').click()
  const control = $('.cs-card-linked-inset')
  await control.scrollIntoView({ block: 'center' })
  const input = control.$('input[aria-label="All sides"]')
  const slider = control.$('[role="slider"]')
  const original = (await snapshot())!
  const unit = original.layout.insets.unit === 'px' ? 'px' : '%'
  const rail = await control.$('.n-slider-rail').getElement()
  const bounds = await browser.execute((element: HTMLElement) => element.getBoundingClientRect().toJSON(), rail)
  const y = Math.round(bounds.y + bounds.height / 2)
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(bounds.x + bounds.width * 0.15), y })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(bounds.x + bounds.width * 0.25), y, duration: 160 }).perform(true)
  await browser.waitUntil(async () => Number(await input.getValue()) !== original.layout.insets.top)
  expect(await snapshot()).toEqual(original)
  await expect($('.cs-inset-side[data-inset-side="left"]'))
    .toHaveAttribute('aria-label', `Left: ${await input.getValue()} ${unit}`)
  await browser.saveScreenshot(`${directory}/inset-slider-held.png`)
  const preview = Number(await input.getValue())
  await browser.action('pointer').up({ button: 'left' }).perform()
  await browser.waitUntil(async () => (await snapshot())!.layout.insets.top === preview)
  expect((await snapshot())!.layout.insets)
    .toMatchObject({ top: preview, right: preview, bottom: preview, left: preview })
  await $('button[aria-label="Undo"]').click()
  expect(await snapshot()).toEqual(original)
  await $('button[aria-label="Redo"]').click()
  expect((await snapshot())!.layout.insets.top).toBe(preview)
  const baseline = (await snapshot())!
  const railAgain = await browser.execute((element: HTMLElement) => element.getBoundingClientRect().toJSON(), rail)
  const currentY = Math.round(railAgain.y + railAgain.height / 2)
  await browser.action('pointer').move({ origin: 'viewport', x: Math.round(railAgain.x + railAgain.width * 0.35), y: currentY })
    .down({ button: 'left' })
    .move({ origin: 'viewport', x: Math.round(railAgain.x + railAgain.width * 0.4), y: currentY, duration: 100 }).perform(true)
  await browser.keys('Escape')
  await browser.action('pointer').up({ button: 'left' }).perform()
  expect(await snapshot()).toEqual(baseline)
  await expect($('.cs-composition-panel')).toBeDisplayed()
  await expect(input).toHaveValue(String(baseline.layout.insets.top))
  const units = $('.cs-card-inset-units')
  await units.$('button=px').click()
  await expect(slider).toHaveAttribute('aria-valuemax', '8192')
  await input.click()
  await browser.keys('Tab')
  const px = (await snapshot())!.layout.insets.top
  await browser.keys('ArrowRight')
  expect((await snapshot())!.layout.insets).toMatchObject({ top: px + 1, right: px + 1, bottom: px + 1, left: px + 1 })
  await units.$('button=%').click()
  await expect(slider).toHaveAttribute('aria-valuemax', '200')
}
