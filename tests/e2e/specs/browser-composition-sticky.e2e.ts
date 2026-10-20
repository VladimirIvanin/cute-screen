import {
  $,
  browser,
  expect,
} from '@wdio/globals'
import { openDrawingHarness } from './browser-m06-test-kit'

async function sectionBounds(title: string) {
  return browser.execute((label) => {
    const body = document.querySelector('.cs-composition-body')!
    const summary = [...body.querySelectorAll(':scope > details > summary')]
      .find((element) => element.textContent === label)!
    return {
      top: summary.getBoundingClientRect().top,
      bottom: summary.getBoundingClientRect().bottom,
      end: summary.parentElement!.getBoundingClientRect().bottom,
      bodyTop: body.getBoundingClientRect().top,
      headerBottom: document.querySelector('.cs-composition-panel header')!.getBoundingClientRect().bottom,
    }
  }, title)
}

async function scrollToSection(title: string): Promise<void> {
  const bounds = await sectionBounds(title)
  await browser.action('wheel').scroll({
    origin: await $('.cs-composition-body').getElement(),
    x: -140,
    y: 0,
    deltaY: Math.round(bounds.top - bounds.bodyTop + 20),
    deltaX: 0,
    duration: 200,
  }).perform()
  await browser.waitUntil(async () => Math.abs((await sectionBounds(title)).top - bounds.bodyTop) < 2)
}

describe('appearance section headings', () => {
  it('pins the current expanded heading below the panel header and keeps collapse available', async () => {
    await browser.setWindowSize(1280, 700)
    await openDrawingHarness(true)
    await $('button[aria-label="Appearance"]').click()
    const panel = $('.cs-composition-panel')
    await panel.$('button=Padding').click()
    await scrollToSection('Background & layout')
    const layout = await sectionBounds('Background & layout')
    expect(layout.top).toBeGreaterThanOrEqual(layout.headerBottom)
    expect(layout.bottom).toBeLessThan(layout.end)
    await browser.saveScreenshot('artifacts/browser-e2e/composition-sticky-layout.png')
    await panel.$('summary=Background & layout').click()
    await expect(panel.$('summary=Background & layout').$('..')).not.toHaveAttribute('open')
    await panel.$('summary=Background & layout').click()
    await scrollToSection('Background & layout')
    expect((await sectionBounds('Background & layout')).top).toBeGreaterThanOrEqual(layout.headerBottom)
  }).timeout(120000)
})
